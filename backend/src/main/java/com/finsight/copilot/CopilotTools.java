package com.finsight.copilot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finsight.accounts.service.AccountService;
import com.finsight.identity.entity.User;
import com.finsight.planning.PlanningService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Pattern;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
class CopilotTools {

    private static final String LEDGER_SCOPE = """
            FROM transactions t JOIN financial_accounts a ON a.id = t.account_id AND a.user_id = t.user_id
            LEFT JOIN categories c ON c.id = t.category_id AND (c.user_id IS NULL OR c.user_id = t.user_id)
            WHERE t.user_id = :user AND a.is_active
                AND t.transaction_date BETWEEN :start AND :end
                AND ((:direction = 'TRANSFER' AND t.is_transfer AND t.direction = 'DEBIT')
                  OR (NOT t.is_transfer AND (:direction = 'ALL' OR t.direction = :direction)))
                AND (:merchant = '' OR strpos(lower(concat_ws(' ', t.merchant, t.description)), lower(:merchant)) > 0)
                AND (:category = '' OR strpos(lower(coalesce(c.name, 'Uncategorized')), lower(:category)) > 0)
                AND (:account = '' OR strpos(lower(a.name), lower(:account)) > 0)
            """;
    private static final Map<String, Object> RANGE = Map.of(
            "start", text("Inclusive start date as YYYY-MM-DD"),
            "end", text("Inclusive end date as YYYY-MM-DD"),
            "direction", choice("ALL", "DEBIT", "CREDIT", "TRANSFER"),
            "merchant", text("Merchant or description substring. Empty means any."),
            "category", text("Category name substring. Empty means any."),
            "account", text("Account name substring. Empty means any."));
    private static final List<Map<String, Object>> DEFINITIONS = List.of(
            function("analyze_transactions",
                    "Calculate exact totals and counts by currency and direction, optionally grouped. For spending use DEBIT, for income use CREDIT. Use TRANSFER for outgoing internal transfers only. Excludes archived accounts.",
                    fields(RANGE, "groupBy", choice("NONE", "CATEGORY", "MERCHANT", "ACCOUNT", "MONTH"))),
            function("compare_transactions",
                    "Compare exact totals for two date ranges with the same filters. Returns amounts and changes separately for each currency and direction. A missing period has no recorded entries.",
                    fields(fields(fields(RANGE, "previousStart", text("Earlier period start as YYYY-MM-DD")),
                            "previousEnd", text("Earlier period end as YYYY-MM-DD")),
                            "groupBy", choice("NONE", "CATEGORY", "MERCHANT", "ACCOUNT"))),
            function("find_transactions",
                    "Find up to 12 individual transactions for evidence. Use TRANSFER for outgoing internal transfers only. Excludes archived accounts.",
                    fields(RANGE, "sortBy", choice("RECENT", "AMOUNT"))),
            function("get_planning",
                    "Read current account balances, budget progress for a month, savings goals, or outstanding recurring bills and income in the planner.",
                    Map.of("month", text("Budget month in YYYY-MM format"),
                            "area", choice("ACCOUNTS", "BUDGETS", "GOALS", "UPCOMING"))));

    private final JdbcClient jdbc;
    private final PlanningService planning;
    private final AccountService accounts;
    private final ObjectMapper json;

    CopilotTools(JdbcClient jdbc, PlanningService planning, AccountService accounts, ObjectMapper json) {
        this.jdbc = jdbc;
        this.planning = planning;
        this.accounts = accounts;
        this.json = json;
    }

    List<Map<String, Object>> definitions() {
        return DEFINITIONS;
    }

    Object run(String name, String arguments, User user, CitationBook citations) {
        try {
            JsonNode args = json.readTree(arguments);
            return switch (name) {
                case "analyze_transactions" -> analyze(user, LedgerFilter.from(args), read(args, "groupBy"), citations);
                case "compare_transactions" -> compare(user, LedgerFilter.from(args), args, citations);
                case "find_transactions" -> find(user, LedgerFilter.from(args), read(args, "sortBy"), citations);
                case "get_planning" -> plan(user, YearMonth.parse(read(args, "month")), read(args, "area"), citations);
                default -> Map.of("error", "Unknown tool");
            };
        } catch (java.io.IOException | IllegalArgumentException | java.time.DateTimeException exception) {
            return Map.of("error", "Invalid tool arguments. Check filter values and use a date range of at most ten years.");
        }
    }

    private Object analyze(User user, LedgerFilter filter, String groupBy, CitationBook citations) {
        var rows = totals(user, filter, grouping(groupBy));
        String source = citations.add("Transactions · " + scope(filter) + " · " + queryLabel(filter, groupBy), "/transactions");
        if ("NONE".equals(groupBy)) citations.includeAll(source);
        if (rows.size() > 30) {
            citations.note(source, "Showing a limited set of transaction groups.");
        }
        var evidence = rows.stream().limit(30).map(row -> Map.of("result", row, "fact", citations.fact(
                label(row.direction(), filter) + " · " + row.label() + " · " + scope(filter)
                        + ": " + money(row.amount(), row.currency()) + " across " + row.rows()
                        + (row.rows() == 1 ? " transaction." : " transactions."), source))).toList();
        if (evidence.isEmpty()) {
            String fact = citations.fact("No matching recorded transactions for " + scope(filter) + ".", source);
            return Map.of("filter", filter, "totals", evidence, "source", source, "fact", fact);
        }
        return Map.of("filter", filter, "totals", evidence, "truncated", rows.size() > 30, "source", source);
    }

    private static String grouping(String groupBy) {
        return switch (groupBy) {
            case "NONE" -> "'Total'::text";
            case "CATEGORY" -> "coalesce(c.name, 'Uncategorized')";
            case "MERCHANT" -> "coalesce(nullif(btrim(t.merchant), ''), 'Merchant unavailable')";
            case "ACCOUNT" -> "a.name";
            case "MONTH" -> "to_char(t.transaction_date, 'YYYY-MM')";
            default -> throw new IllegalArgumentException("Invalid grouping");
        };
    }

    private List<Total> totals(User user, LedgerFilter filter, String group) {
        return match("SELECT " + group + " AS label, t.currency, t.direction, sum(t.amount) AS amount, count(*) AS rows "
                + LEDGER_SCOPE + " GROUP BY 1, 2, 3 ORDER BY amount DESC, 1, 2, 3 LIMIT 31", user, filter)
                .query((rs, index) -> new Total(rs.getString("label"), rs.getString("currency"), rs.getString("direction"),
                        rs.getBigDecimal("amount"), rs.getLong("rows"))).list();
    }

    private Object compare(User user, LedgerFilter current, JsonNode args, CitationBook citations) {
        LedgerFilter previous = new LedgerFilter(LocalDate.parse(read(args, "previousStart")),
                LocalDate.parse(read(args, "previousEnd")), current.direction(), current.merchant(),
                current.category(), current.account());
        String groupBy = read(args, "groupBy");
        if ("MONTH".equals(groupBy)) throw new IllegalArgumentException("Invalid comparison grouping");
        String group = grouping(groupBy);
        String ranges = scope(current) + " vs. " + scope(previous);
        String source = citations.add("Ledger comparison · " + ranges + " · " + queryLabel(current, groupBy), "/transactions");
        if ("NONE".equals(groupBy)) citations.includeAll(source);
        var currentRows = totals(user, current, group);
        var previousRows = totals(user, previous, group);
        if (currentRows.size() > 30 || previousRows.size() > 30) {
            citations.note(source, "Some groups were omitted. A missing comparison may reflect the group limit.");
        }
        Map<ComparisonKey, Total[]> pairs = new LinkedHashMap<>();
        for (Total total : currentRows.stream().limit(30).toList()) {
            pairs.computeIfAbsent(ComparisonKey.of(total), key -> new Total[2])[0] = total;
        }
        for (Total total : previousRows.stream().limit(30).toList()) {
            pairs.computeIfAbsent(ComparisonKey.of(total), key -> new Total[2])[1] = total;
        }
        if (pairs.isEmpty()) {
            return Map.of("fact", citations.fact("No matching recorded transactions for either period · " + ranges + ".", source));
        }
        if (pairs.size() > 30) {
            citations.note(source, "Showing a limited set of comparison groups.");
        }
        List<Map<String, Object>> comparisons = new ArrayList<>();
        for (Total[] pair : pairs.values().stream().limit(30).toList()) {
            Total currentTotal = pair[0];
            Total previousTotal = pair[1];
            Total available = currentTotal != null ? currentTotal : previousTotal;
            String currency = available.currency();
            String summary = label(available.direction(), current) + " · " + available.label()
                    + " (" + currency + ") · " + ranges + ": ";
            if (currentTotal == null || previousTotal == null) {
                String currentText = currentTotal == null ? "no recorded entries" : money(currentTotal.amount(), currency);
                String previousText = previousTotal == null ? "no recorded entries" : money(previousTotal.amount(), currency);
                comparisons.add(Map.of("fact", citations.fact(summary + currentText + " vs. " + previousText
                        + ". A change could not be calculated from the available records.", source)));
                continue;
            }
            BigDecimal difference = currentTotal.amount().subtract(previousTotal.amount());
            var result = new LinkedHashMap<String, Object>();
            result.put("current", currentTotal);
            result.put("previous", previousTotal);
            result.put("change", difference);
            String change = " Change: " + delta(difference) + " " + currency;
            if (previousTotal.amount().signum() > 0) {
                BigDecimal percent = difference.movePointRight(2).divide(previousTotal.amount(), 1, RoundingMode.HALF_UP);
                result.put("percentChange", percent);
                change += " (" + delta(percent) + "%)";
            }
            result.put("fact", citations.fact(summary + money(currentTotal.amount(), currency) + " vs. "
                    + money(previousTotal.amount(), currency) + "." + change + ".", source));
            comparisons.add(result);
        }
        return Map.of("comparisons", comparisons, "source", source);
    }

    private static String delta(BigDecimal value) {
        return (value.signum() > 0 ? "+" : "") + value.stripTrailingZeros().toPlainString();
    }

    private static String money(BigDecimal amount, String currency) {
        return currency + " " + amount.stripTrailingZeros().toPlainString();
    }

    private static String label(String direction, LedgerFilter filter) {
        if ("TRANSFER".equals(filter.direction())) return "Outgoing transfers";
        return "DEBIT".equals(direction) ? "Posted spending" : "Recorded income";
    }

    private static String queryLabel(LedgerFilter filter, String grouping) {
        String direction = switch (filter.direction()) {
            case "DEBIT" -> "spending";
            case "CREDIT" -> "income";
            case "TRANSFER" -> "outgoing transfers";
            default -> "spending and income";
        };
        return "NONE".equals(grouping) ? direction : direction + " by " + grouping.toLowerCase(Locale.ROOT);
    }

    private static String scope(LedgerFilter filter) {
        return filter.start() + " to " + filter.end()
                + (filter.account().isEmpty() ? "" : " · account matches “" + filter.account() + "”")
                + (filter.category().isEmpty() ? "" : " · category matches “" + filter.category() + "”")
                + (filter.merchant().isEmpty() ? "" : " · merchant or description matches “" + filter.merchant() + "”");
    }

    private Object find(User user, LedgerFilter filter, String order, CitationBook citations) {
        String sort = switch (order) {
            case "AMOUNT" -> "t.amount DESC, t.transaction_date DESC, t.id";
            case "RECENT" -> "t.transaction_date DESC, t.id";
            default -> throw new IllegalArgumentException("Invalid sort");
        };
        var rows = match("""
                SELECT t.id, t.transaction_date, t.amount, t.currency, t.direction,
                       coalesce(nullif(trim(t.merchant), ''), 'Merchant unavailable') AS merchant,
                       coalesce(c.name, 'Uncategorized') AS category, a.name AS account
                """ + LEDGER_SCOPE + " ORDER BY " + sort + " LIMIT 13", user, filter)
                .query((rs, index) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    LocalDate date = rs.getObject("transaction_date", LocalDate.class);
                    BigDecimal amount = rs.getBigDecimal("amount");
                    String currency = rs.getString("currency");
                    String direction = rs.getString("direction");
                    String merchant = rs.getString("merchant");
                    String category = rs.getString("category");
                    String account = rs.getString("account");
                    String source = index < 12 ? citations.add("Transaction · " + date + " · " + money(amount, currency),
                            "/transactions?evidence=" + id) : "";
                    String fact = index < 12 ? citations.fact(label(direction, filter) + " · " + date + " · "
                            + merchant + " · " + category + " · " + account + ": " + money(amount, currency) + ".", source) : "";
                    return new TransactionFact(date, amount, currency, direction, merchant, category, account, source, fact);
                }).list();
        if (rows.isEmpty()) {
            String source = citations.add("Transaction search · " + scope(filter), "/transactions");
            return Map.of("filter", filter, "transactions", List.of(), "fact",
                    citations.fact("No matching transactions for " + scope(filter) + ".", source));
        }
        if (rows.size() > 12) {
            rows.stream().limit(12).forEach(row -> citations.note(row.source(),
                    "Showing up to 12 matching transactions. This list is a sample, not a total."));
        }
        return Map.of("filter", filter, "transactions", rows.stream().limit(12).toList(), "truncated", rows.size() > 12);
    }

    private Object plan(User user, YearMonth month, String area, CitationBook citations) {
        if (month.getYear() < 1900 || month.getYear() > 9999) {
            throw new IllegalArgumentException("Invalid planning month");
        }
        if (area.equals("ACCOUNTS")) {
            var balances = accounts.getAccountsForUser(user, false);
            String source = citations.add("Active accounts", "/accounts");
            return planningResult("accounts", balances.stream().limit(31).map(account -> Map.of(
                    "name", account.name(), "type", account.type(), "balance", account.currentBalance(),
                    "currency", account.currency(), "fact", citations.fact("Account balance · " + account.name()
                            + ": " + money(account.currentBalance(), account.currency()) + ".", source))).toList(),
                    source, "No active accounts were found.", citations);
        }
        if (!Set.of("BUDGETS", "GOALS", "UPCOMING").contains(area)) {
            throw new IllegalArgumentException("Invalid planning area");
        }
        var data = planning.overview(user, month);
        String source = citations.add("Planning · " + month, "/planning?month=" + month);
        return switch (area) {
            case "BUDGETS" -> planningResult("budgets", data.budgets().stream().limit(31).map(b -> {
                BigDecimal remaining = b.amount().subtract(b.spent());
                String status = remaining.signum() < 0 ? "over by " : "remaining ";
                return Map.of("category", b.categoryName(), "currency", b.currency(), "limit", b.amount(),
                        "spent", b.spent(), "fact", citations.fact("Budget · " + month + " · " + b.categoryName()
                                + ": " + money(b.spent(), b.currency()) + " spent of " + money(b.amount(), b.currency())
                                + ", " + status + money(remaining.abs(), b.currency()) + ".", source));
            }).toList(), source, "No budgets were found for " + month + ".", citations);
            case "GOALS" -> planningResult("goals", data.goals().stream().limit(31).map(g -> Map.of(
                    "name", g.name(), "currency", g.currency(), "target", g.targetAmount(), "saved", g.savedAmount(),
                    "targetDate", Objects.toString(g.targetDate(), ""), "fact", citations.fact("Savings goal · " + g.name()
                            + ": " + money(g.savedAmount(), g.currency()) + " saved of " + money(g.targetAmount(), g.currency())
                            + ", " + money(g.targetAmount().subtract(g.savedAmount()).max(BigDecimal.ZERO), g.currency())
                            + " remaining" + (g.targetDate() == null ? "." : " · target " + g.targetDate() + "."), source)))
                    .toList(), source, "No savings goals were found.", citations);
            default -> planningResult("upcoming", data.occurrences().stream()
                    .filter(o -> o.transactionId() == null && !o.dueDate().isBefore(data.today())).limit(31)
                    .map(o -> Map.of("name", o.name(), "dueDate", o.dueDate(), "direction", o.direction(), "amount", o.amount(),
                            "currency", o.currency(), "fact", citations.fact(
                                    ("DEBIT".equals(o.direction().name()) ? "Expected bill" : "Expected income") + " · " + o.dueDate()
                                            + " · " + o.name() + ": " + money(o.amount(), o.currency()) + ".", source)))
                    .toList(), source, "No outstanding scheduled items were found from " + data.today() + " through "
                            + data.through() + ".", citations);
        };
    }

    private Object planningResult(String name, List<?> items, String source, String empty, CitationBook citations) {
        if (items.isEmpty()) {
            return Map.of(name, items, "source", source, "fact", citations.fact(empty, source));
        }
        if (items.size() > 30) {
            citations.note(source, "Showing a limited set of " + name + ".");
        }
        return Map.of(name, items.stream().limit(30).toList(), "truncated", items.size() > 30, "source", source);
    }

    private JdbcClient.StatementSpec match(String sql, User user, LedgerFilter filter) {
        return jdbc.sql(sql).param("user", user.getId()).param("start", filter.start()).param("end", filter.end())
                .param("direction", filter.direction()).param("merchant", filter.merchant())
                .param("category", filter.category()).param("account", filter.account());
    }

    private static String read(JsonNode args, String field) {
        if (args == null || !args.path(field).isTextual() || args.path(field).asText().length() > 120) {
            throw new IllegalArgumentException("Invalid tool field");
        }
        return args.path(field).asText().strip();
    }

    private static Map<String, Object> text(String description) {
        return Map.of("type", "string", "description", description);
    }

    private static Map<String, Object> choice(String... values) {
        return Map.of("type", "string", "enum", List.of(values));
    }

    private static Map<String, Object> fields(Map<String, Object> base, String key, Object field) {
        var properties = new HashMap<>(base);
        properties.put(key, field);
        return properties;
    }

    private static Map<String, Object> function(String name, String description, Map<String, Object> properties) {
        return Map.of("type", "function", "name", name, "description", description, "strict", true,
                "parameters", Map.of("type", "object", "additionalProperties", false, "properties", properties,
                        "required", properties.keySet().stream().sorted().toList()));
    }

    record LedgerFilter(LocalDate start, LocalDate end, String direction, String merchant, String category, String account) {
        LedgerFilter {
            if (start.getYear() < 1900 || end.getYear() > 9999 || end.isBefore(start)
                    || ChronoUnit.DAYS.between(start, end) >= 3_660 || !Set.of("ALL", "DEBIT", "CREDIT", "TRANSFER").contains(direction)) {
                throw new IllegalArgumentException("Invalid ledger filter");
            }
        }

        static LedgerFilter from(JsonNode args) {
            return new LedgerFilter(LocalDate.parse(read(args, "start")), LocalDate.parse(read(args, "end")),
                    read(args, "direction"), read(args, "merchant"), read(args, "category"), read(args, "account"));
        }
    }

    private record ComparisonKey(String currency, String direction, String label) {
        static ComparisonKey of(Total total) {
            return new ComparisonKey(total.currency(), total.direction(), total.label());
        }
    }

    record Total(String label, String currency, String direction, BigDecimal amount, long rows) {}
    record TransactionFact(LocalDate date, BigDecimal amount, String currency, String direction,
                           String merchant, String category, String account, String source, String fact) {}
    record Citation(String id, String label, String path) {}

    record Fact(String id, String text, String source) {}

    static class CitationBook {
        private static final Pattern FACT_MARKER = Pattern.compile("\\{\\{(F[0-9]+)}}");
        private final List<Citation> entries = new ArrayList<>();
        private final Map<String, Fact> facts = new LinkedHashMap<>();
        private final Map<String, String> notes = new HashMap<>();
        private final Set<String> completeSources = new HashSet<>();

        void includeAll(String source) {
            completeSources.add(source);
        }

        String fact(String text, String source) {
            for (Fact existing : facts.values()) {
                if (existing.source().equals(source) && existing.text().equals(text)) return existing.id();
            }
            String id = "F" + (facts.size() + 1);
            facts.put(id, new Fact(id, text, source));
            return id;
        }

        void note(String source, String note) {
            notes.put(source, note);
        }

        List<Fact> selectedFacts(CopilotReply reply) {
            var matches = FACT_MARKER.matcher(reply.answer());
            Set<Fact> selected = new LinkedHashSet<>();
            while (matches.find() && selected.size() < 8) {
                Fact fact = facts.get(matches.group(1));
                if (fact != null) {
                    if (completeSources.contains(fact.source())) {
                        facts.values().stream().filter(candidate -> candidate.source().equals(fact.source()))
                                .limit(8).forEach(selected::add);
                    } else {
                        selected.add(fact);
                    }
                }
            }
            if (!selected.isEmpty()) return selected.stream().limit(8).toList();

            var cited = facts.values().stream().filter(f -> reply.sourceRefs().contains(f.source())).limit(8).toList();
            return cited.isEmpty() ? facts.values().stream().limit(8).toList() : cited;
        }

        List<String> notesFor(List<String> sources) {
            return sources.stream().map(notes::get).filter(Objects::nonNull).distinct().toList();
        }

        String add(String label, String path) {
            return entries.stream().filter(item -> item.label().equals(label) && item.path().equals(path))
                    .findFirst().orElseGet(() -> {
                        var item = new Citation("S" + (entries.size() + 1), label, path);
                        entries.add(item);
                        return item;
                    }).id();
        }

        List<Citation> resolve(List<String> references) {
            return references == null ? List.of() : entries.stream().filter(item -> references.contains(item.id()))
                    .limit(12).toList();
        }
    }
}
