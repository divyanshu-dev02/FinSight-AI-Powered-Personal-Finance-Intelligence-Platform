package com.finsight.copilot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finsight.accounts.service.AccountService;
import com.finsight.identity.entity.User;
import com.finsight.planning.PlanningService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
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
                case "find_transactions" -> find(user, LedgerFilter.from(args), read(args, "sortBy"), citations);
                case "get_planning" -> plan(user, YearMonth.parse(read(args, "month")), read(args, "area"), citations);
                default -> Map.of("error", "Unknown tool");
            };
        } catch (java.io.IOException | IllegalArgumentException | java.time.DateTimeException exception) {
            return Map.of("error", "Invalid tool arguments. Check filter values and use a date range of at most ten years.");
        }
    }

    private Object analyze(User user, LedgerFilter filter, String groupBy, CitationBook citations) {
        String group = switch (groupBy) {
            case "NONE" -> "'Total'::text";
            case "CATEGORY" -> "coalesce(c.name, 'Uncategorized')";
            case "MERCHANT" -> "coalesce(nullif(btrim(t.merchant), ''), 'Merchant unavailable')";
            case "ACCOUNT" -> "a.name";
            case "MONTH" -> "to_char(t.transaction_date, 'YYYY-MM')";
            default -> throw new IllegalArgumentException("Invalid grouping");
        };
        var rows = match("SELECT " + group + " AS label, t.currency, t.direction, sum(t.amount) AS amount, count(*) AS rows "
                + LEDGER_SCOPE + " GROUP BY 1, 2, 3 ORDER BY amount DESC, 1, 2, 3 LIMIT 31", user, filter)
                .query((rs, index) -> new Total(rs.getString("label"), rs.getString("currency"), rs.getString("direction"),
                        rs.getBigDecimal("amount"), rs.getLong("rows"))).list();
        String reference = citations.add("Transactions · " + filter.start() + " to " + filter.end(), "/transactions");
        return Map.of("filter", filter, "totals", rows.stream().limit(30).toList(),
                "truncated", rows.size() > 30, "source", reference);
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
                    return new TransactionFact(date, amount, currency, rs.getString("direction"), rs.getString("merchant"),
                            rs.getString("category"), rs.getString("account"),
                            index < 12 ? citations.add("Transaction · " + date + " · " + currency + " " + amount.stripTrailingZeros().toPlainString(),
                                    "/transactions?evidence=" + id) : "");
                }).list();
        return Map.of("filter", filter, "transactions", rows.stream().limit(12).toList(), "truncated", rows.size() > 12);
    }

    private Object plan(User user, YearMonth month, String area, CitationBook citations) {
        if (month.getYear() < 1900 || month.getYear() > 9999) {
            throw new IllegalArgumentException("Invalid planning month");
        }
        if (area.equals("ACCOUNTS")) {
            var balances = accounts.getAccountsForUser(user, false);
            return Map.of("accounts", balances.stream().limit(30)
                            .map(a -> Map.of("name", a.name(), "type", a.type(), "balance", a.currentBalance(), "currency", a.currency()))
                            .toList(), "truncated", balances.size() > 30, "source", citations.add("Active accounts", "/accounts"));
        }
        if (!Set.of("BUDGETS", "GOALS", "UPCOMING").contains(area)) {
            throw new IllegalArgumentException("Invalid planning area");
        }
        var data = planning.overview(user, month);
        List<?> items = switch (area) {
            case "BUDGETS" -> data.budgets().stream().map(b -> Map.of("category", b.categoryName(), "currency", b.currency(),
                    "limit", b.amount(), "spent", b.spent())).toList();
            case "GOALS" -> data.goals().stream().map(g -> Map.of("name", g.name(), "currency", g.currency(),
                    "target", g.targetAmount(), "saved", g.savedAmount(), "targetDate", Objects.toString(g.targetDate(), ""))).toList();
            default -> data.occurrences().stream().filter(o -> o.transactionId() == null && !o.dueDate().isBefore(data.today()))
                    .map(o -> Map.of("name", o.name(), "dueDate", o.dueDate(), "direction", o.direction(),
                            "amount", o.amount(), "currency", o.currency())).toList();
        };
        return Map.of("area", area, "month", month, "today", data.today(), "through", data.through(),
                "items", items.stream().limit(30).toList(), "truncated", items.size() > 30,
                "source", citations.add("Planning · " + month, "/planning?month=" + month));
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
        static LedgerFilter from(JsonNode args) {
            var start = LocalDate.parse(read(args, "start"));
            var end = LocalDate.parse(read(args, "end"));
            String direction = read(args, "direction");
            if (start.getYear() < 1900 || end.getYear() > 9999 || end.isBefore(start)
                    || ChronoUnit.DAYS.between(start, end) >= 3_660 || !Set.of("ALL", "DEBIT", "CREDIT", "TRANSFER").contains(direction)) {
                throw new IllegalArgumentException("Invalid ledger filter");
            }
            return new LedgerFilter(start, end, direction, read(args, "merchant"), read(args, "category"), read(args, "account"));
        }
    }

    record Total(String label, String currency, String direction, BigDecimal amount, long rows) {}
    record TransactionFact(LocalDate date, BigDecimal amount, String currency, String direction,
                           String merchant, String category, String account, String source) {}
    record Citation(String id, String label, String path) {}

    static class CitationBook {
        private final List<Citation> entries = new ArrayList<>();

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
