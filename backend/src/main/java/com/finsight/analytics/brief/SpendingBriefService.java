package com.finsight.analytics.brief;

import com.finsight.analytics.service.SpendingPeriods;
import com.finsight.identity.entity.User;
import com.finsight.transactions.repository.TransactionRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
class SpendingBriefService {

    private static final BigDecimal SPENDING_CHANGE = new BigDecimal("0.15");
    private static final BigDecimal PRICE_INCREASE = new BigDecimal("0.10");

    private final TransactionRepository transactions;
    private final JdbcClient jdbc;

    SpendingBriefService(TransactionRepository transactions, JdbcClient jdbc) {
        this.transactions = transactions;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    Brief getBrief(User user, YearMonth month) {
        LocalDate today = LocalDate.now(ZoneId.of(user.getTimeZone()));
        SpendingPeriods periods = SpendingPeriods.comparable(month, today);
        if (month.isAfter(YearMonth.from(today))) {
            return new Brief(periods, List.of());
        }

        var dismissed = jdbc.sql("SELECT finding_id FROM brief_dismissals WHERE user_id = :userId")
                .param("userId", user.getId()).query(UUID.class).set();
        var previousByCurrency = transactions.spendingByCurrency(user, periods.previousStart(), periods.previousEnd())
                .stream().collect(Collectors.toMap(TransactionRepository.CurrencyTotal::getCurrency,
                        TransactionRepository.CurrencyTotal::getAmount));
        List<Finding> findings = new ArrayList<>();
        for (var current : transactions.spendingByCurrency(user, periods.currentStart(), periods.currentEnd())) {
            String currency = current.getCurrency();
            BigDecimal previous = previousByCurrency.get(currency);
            if (previous == null || previous.signum() <= 0 ||
                    current.getAmount().subtract(previous).abs().compareTo(previous.multiply(SPENDING_CHANGE)) < 0) {
                continue;
            }

            UUID id = version("spending", month, currency, previous, current.getAmount());
            if (!dismissed.contains(id)) {
                List<Evidence> evidence = new ArrayList<>(largest(user, periods.currentStart(), periods.currentEnd(), currency));
                evidence.addAll(largest(user, periods.previousStart(), periods.previousEnd(), currency));
                findings.add(new Finding(id, Kind.SPENDING_CHANGE, null, currency,
                        previous, current.getAmount(), evidence));
            }
        }

        LocalDate recurringThrough = month.equals(YearMonth.from(today)) ? today : month.atEndOfMonth();
        for (RecurringPair pair : recurringPairs(user, month.atDay(1), recurringThrough)) {
            boolean increased = pair.hasEarlierMonthlyCharge()
                    && pair.current().amount().subtract(pair.previous().amount())
                        .compareTo(pair.previous().amount().multiply(PRICE_INCREASE)) >= 0;
            Kind kind = increased ? Kind.RECURRING_INCREASE : Kind.RECURRING_CANDIDATE;
            UUID id = version(kind, pair.current().id(), pair.previous().id(),
                    pair.current().amount(), pair.previous().amount());
            if (!dismissed.contains(id)) {
                findings.add(new Finding(id, kind, pair.merchant(), pair.currency(),
                        pair.previous().amount(), pair.current().amount(), List.of(pair.current(), pair.previous())));
            }
        }
        return new Brief(periods, findings);
    }

    @Transactional
    void dismiss(User user, UUID findingId) {
        jdbc.sql("""
                INSERT INTO brief_dismissals (user_id, finding_id) VALUES (:userId, :findingId)
                ON CONFLICT (user_id, finding_id) DO NOTHING
                """)
                .param("userId", user.getId()).param("findingId", findingId).update();
    }

    private List<Evidence> largest(User user, LocalDate start, LocalDate end, String currency) {
        return transactions.largestExpenses(user, start, end, currency, PageRequest.of(0, 2)).stream()
                .map(t -> new Evidence(t.getId(), t.getTransactionDate(), t.getAmount())).toList();
    }

    private List<RecurringPair> recurringPairs(User user, LocalDate start, LocalDate end) {
        return jdbc.sql("""
                WITH charge_history AS (
                    SELECT t.id, t.merchant, t.currency, t.amount, t.transaction_date,
                           lag(t.id) OVER merchant_history AS previous_id,
                           lag(t.amount) OVER merchant_history AS previous_amount,
                           lag(t.transaction_date) OVER merchant_history AS previous_date,
                           lag(t.transaction_date, 2) OVER merchant_history AS earlier_date,
                           row_number() OVER merchant_history_desc AS latest_rank
                    FROM transactions t
                    JOIN financial_accounts a ON a.id = t.account_id
                    WHERE t.user_id = :userId AND a.is_active AND t.direction = 'DEBIT'
                        AND NOT t.is_transfer AND NULLIF(btrim(t.merchant), '') IS NOT NULL
                        AND t.transaction_date BETWEEN :historyStart AND :periodEnd
                    WINDOW merchant_history AS (
                        PARTITION BY t.account_id, t.currency, lower(btrim(t.merchant))
                        ORDER BY t.transaction_date, t.id
                    ), merchant_history_desc AS (
                        PARTITION BY t.account_id, t.currency, lower(btrim(t.merchant))
                        ORDER BY t.transaction_date DESC, t.id DESC
                    )
                )
                SELECT *, (previous_date - earlier_date BETWEEN 25 AND 35) AS earlier_monthly
                FROM charge_history
                WHERE latest_rank = 1 AND transaction_date >= :periodStart
                    AND transaction_date - previous_date BETWEEN 25 AND 35
                    AND (earlier_date IS NULL OR previous_date - earlier_date NOT BETWEEN 25 AND 35
                         OR amount - previous_amount >= previous_amount * :increaseThreshold)
                ORDER BY transaction_date DESC, id
                LIMIT 20
                """)
                .param("userId", user.getId()).param("historyStart", start.minusDays(70))
                .param("periodStart", start).param("periodEnd", end).param("increaseThreshold", PRICE_INCREASE)
                .query((rs, row) -> new RecurringPair(rs.getString("merchant").strip(), rs.getString("currency"),
                        new Evidence(rs.getObject("id", UUID.class), rs.getObject("transaction_date", LocalDate.class),
                                rs.getBigDecimal("amount")),
                        new Evidence(rs.getObject("previous_id", UUID.class), rs.getObject("previous_date", LocalDate.class),
                                rs.getBigDecimal("previous_amount")), rs.getBoolean("earlier_monthly")))
                .list();
    }

    private static UUID version(Object... values) {
        return UUID.nameUUIDFromBytes(java.util.Arrays.toString(values).getBytes(StandardCharsets.UTF_8));
    }

    enum Kind { SPENDING_CHANGE, RECURRING_CANDIDATE, RECURRING_INCREASE }

    record Brief(SpendingPeriods periods, List<Finding> findings) {}
    record Finding(UUID id, Kind kind, String merchant, String currency, BigDecimal previousAmount,
                   BigDecimal currentAmount, List<Evidence> evidence) {}
    record Evidence(UUID id, LocalDate date, BigDecimal amount) {}
    private record RecurringPair(String merchant, String currency, Evidence current,
                                 Evidence previous, boolean hasEarlierMonthlyCharge) {}
}
