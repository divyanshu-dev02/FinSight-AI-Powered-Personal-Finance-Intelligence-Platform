package com.finsight.planning;

import com.finsight.accounts.service.AccountService;
import com.finsight.categories.entity.CategoryType;
import com.finsight.categories.repository.CategoryRepository;
import com.finsight.common.exception.BusinessException;
import com.finsight.common.exception.ResourceNotFoundException;
import com.finsight.identity.entity.User;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.Currency;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.finsight.planning.PlanningModels.*;

@Service
public class PlanningService {

    private static final int MATCH_DAYS = 7;
    private final JdbcClient jdbc;
    private final CategoryRepository categories;
    private final AccountService accounts;

    PlanningService(JdbcClient jdbc, CategoryRepository categories, AccountService accounts) {
        this.jdbc = jdbc;
        this.categories = categories;
        this.accounts = accounts;
    }

    @Transactional(readOnly = true)
    public Overview overview(User user, YearMonth month) {
        LocalDate today = LocalDate.now(ZoneId.of(user.getTimeZone()));
        LocalDate from = today.minusDays(MATCH_DAYS);
        LocalDate through = today.plusDays(29);
        var budgets = jdbc.sql("""
                SELECT b.id, b.category_id, c.name AS category_name, b.currency, b.amount,
                       coalesce(s.spent, 0) AS spent
                FROM monthly_budgets b
                JOIN categories c ON c.id = b.category_id
                LEFT JOIN (
                    SELECT t.category_id, t.currency, sum(t.amount) AS spent
                    FROM transactions t JOIN financial_accounts a ON a.id = t.account_id
                    WHERE t.user_id = :userId AND t.direction = 'DEBIT' AND NOT t.is_transfer AND a.is_active
                      AND t.transaction_date BETWEEN :month AND :endOfMonth
                    GROUP BY t.category_id, t.currency
                ) s ON s.category_id = b.category_id AND s.currency = b.currency
                WHERE b.user_id = :userId AND b.month = :month
                ORDER BY c.name, b.currency
                """).param("userId", user.getId()).param("month", month.atDay(1))
                .param("endOfMonth", month.atEndOfMonth()).query(Budget.class).list();
        var goals = jdbc.sql("""
                SELECT id, name, currency, target_amount, saved_amount, target_date
                FROM savings_goals WHERE user_id = :userId ORDER BY target_date NULLS LAST, name, id
                """).param("userId", user.getId()).query(Goal.class).list();
        var commitments = jdbc.sql(COMMITMENTS + " ORDER BY c.name, c.id")
                .param("userId", user.getId()).query(Commitment.class).list();
        Map<OccurrenceKey, UUID> posted = jdbc.sql("""
                SELECT p.commitment_id, p.due_date, p.transaction_id
                FROM recurring_postings p JOIN recurring_commitments c ON c.id = p.commitment_id
                WHERE c.user_id = :userId AND p.due_date BETWEEN :from AND :through
                """).param("userId", user.getId()).param("from", from).param("through", through)
                .query((rs, row) -> Map.entry(new OccurrenceKey(rs.getObject("commitment_id", UUID.class),
                        rs.getObject("due_date", LocalDate.class)), rs.getObject("transaction_id", UUID.class)))
                .list().stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
        var occurrences = commitments.stream().filter(c -> c.active() && c.accountActive())
                .flatMap(c -> from.datesUntil(through.plusDays(1))
                        .filter(date -> c.frequency().occursOn(c.firstDate(), date))
                        .map(date -> new Occurrence(c.id(), c.name(), c.currency(), c.direction(), c.amount(), date,
                                posted.get(new OccurrenceKey(c.id(), date)))))
                .sorted(Comparator.comparing(Occurrence::dueDate).thenComparing(Occurrence::name))
                .toList();
        return new Overview(month, today, through, budgets, goals, commitments, occurrences);
    }

    @Transactional
    UUID writeBudget(User user, UUID id, BudgetInput input) {
        requireCurrency(input.currency());
        var category = categories.findByIdAndAvailableForUser(input.categoryId(), user);
        if (category.isEmpty() || category.get().getType() != CategoryType.EXPENSE) {
            throw new BusinessException("INVALID_BUDGET_CATEGORY", "Choose an available expense category.");
        }
        String sql = id == null ? """
                INSERT INTO monthly_budgets(id, user_id, category_id, month, currency, amount)
                VALUES (:id, :userId, :category, :month, :currency, :amount)
                """ : """
                UPDATE monthly_budgets SET category_id = :category, month = :month, currency = :currency, amount = :amount
                WHERE user_id = :userId AND id = :id
                """;
        UUID key = id == null ? UUID.randomUUID() : id;
        try {
            requireUpdated(jdbc.sql(sql).param("id", key).param("userId", user.getId())
                    .param("category", input.categoryId()).param("month", input.month().atDay(1))
                    .param("currency", input.currency()).param("amount", input.amount()).update(), "Budget", key);
        } catch (DuplicateKeyException exception) {
            throw new BusinessException("DUPLICATE_BUDGET", "A budget already exists for this category, month, and currency.");
        }
        return key;
    }

    UUID writeGoal(User user, UUID id, GoalInput input) {
        requireCurrency(input.currency());
        String sql = id == null ? """
                INSERT INTO savings_goals(id, user_id, name, currency, target_amount, saved_amount, target_date)
                VALUES (:id, :userId, :name, :currency, :targetAmount, :savedAmount, :targetDate)
                """ : """
                UPDATE savings_goals SET name = :name, currency = :currency, target_amount = :targetAmount,
                    saved_amount = :savedAmount, target_date = :targetDate
                WHERE user_id = :userId AND id = :id
                """;
        UUID key = id == null ? UUID.randomUUID() : id;
        requireUpdated(jdbc.sql(sql).param("id", key).param("userId", user.getId()).param("name", input.name().strip())
                .param("currency", input.currency()).param("targetAmount", input.targetAmount())
                .param("savedAmount", input.savedAmount()).param("targetDate", input.targetDate()).update(), "Savings goal", key);
        return key;
    }

    @Transactional
    UUID writeCommitment(User user, UUID id, CommitmentInput input) {
        var account = accounts.findAccountOrThrow(input.accountId(), user);
        if (!account.isActive() && input.active()) {
            throw new BusinessException("INACTIVE_ACCOUNT", "Choose an active account for this schedule.");
        }
        if (id != null) {
            Commitment previous = lockCommitment(user, id);
            boolean changesSchedule = previous.frequency() != input.frequency() || !previous.firstDate().equals(input.firstDate())
                    || !previous.accountId().equals(input.accountId()) || previous.direction() != input.direction();
            boolean hasPostings = changesSchedule && jdbc.sql("""
                    SELECT EXISTS(SELECT 1 FROM recurring_postings WHERE commitment_id = :id)
                    """).param("id", id).query(Boolean.class).single();
            if (hasPostings) {
                throw new BusinessException("LINKED_COMMITMENT", "Pause this schedule and create a new one to change its dates, account, or direction.");
            }
        }
        String sql = id == null ? """
                INSERT INTO recurring_commitments(id, user_id, name, account_id, direction, amount, frequency, first_date, active)
                VALUES (:id, :userId, :name, :account, :direction, :amount, :frequency, :firstDate, :active)
                """ : """
                UPDATE recurring_commitments SET name = :name, account_id = :account, direction = :direction,
                    amount = :amount, frequency = :frequency, first_date = :firstDate, active = :active
                WHERE user_id = :userId AND id = :id
                """;
        UUID key = id == null ? UUID.randomUUID() : id;
        requireUpdated(jdbc.sql(sql).param("id", key).param("userId", user.getId()).param("name", input.name().strip())
                .param("account", input.accountId()).param("direction", input.direction().name()).param("amount", input.amount())
                .param("frequency", input.frequency().name()).param("firstDate", input.firstDate()).param("active", input.active())
                .update(), "Recurring commitment", key);
        return key;
    }

    List<Candidate> candidates(User user, UUID id, LocalDate date) {
        var commitment = jdbc.sql(COMMITMENTS + " AND c.id = :id").param("userId", user.getId()).param("id", id)
                .query(Commitment.class).optional().orElseThrow(() -> new ResourceNotFoundException("Recurring commitment", "id", id));
        checkOccurrence(commitment, date);
        return matchingTransactions(user, commitment, date, """
                AND NOT EXISTS(SELECT 1 FROM recurring_postings WHERE transaction_id = t.id)
                ORDER BY abs(t.transaction_date - CAST(:dueDate AS date)), t.transaction_date DESC, t.id LIMIT 25
                """).param("dueDate", date).query(Candidate.class).list();
    }

    @Transactional
    void linkPosting(User user, UUID id, LocalDate date, UUID transactionId) {
        Commitment commitment = lockCommitment(user, id);
        checkOccurrence(commitment, date);
        boolean valid = matchingTransactions(user, commitment, date, " AND t.id = :transactionId")
                .param("transactionId", transactionId).query(Candidate.class).optional().isPresent();
        if (!valid) {
            throw new BusinessException("INVALID_POSTING", "Choose a posted transaction from the same account, direction, and due-date window.");
        }
        try {
            jdbc.sql("""
                    INSERT INTO recurring_postings(commitment_id, due_date, transaction_id)
                    VALUES (:id, :date, :transaction)
                    ON CONFLICT (commitment_id, due_date) DO UPDATE SET transaction_id = EXCLUDED.transaction_id
                    """).param("id", id).param("date", date).param("transaction", transactionId).update();
        } catch (DuplicateKeyException exception) {
            throw new BusinessException("POSTING_ALREADY_LINKED", "This transaction already covers another scheduled occurrence.");
        }
    }

    @Transactional
    void unlinkPosting(User user, UUID id, LocalDate date) {
        lockCommitment(user, id);
        jdbc.sql("DELETE FROM recurring_postings WHERE commitment_id = :id AND due_date = :date")
                .param("id", id).param("date", date).update();
    }

    void removeBudget(User user, UUID id) {
        requireUpdated(jdbc.sql("DELETE FROM monthly_budgets WHERE id = :id AND user_id = :userId")
                .param("id", id).param("userId", user.getId()).update(), "Budget", id);
    }

    void removeGoal(User user, UUID id) {
        requireUpdated(jdbc.sql("DELETE FROM savings_goals WHERE id = :id AND user_id = :userId")
                .param("id", id).param("userId", user.getId()).update(), "Savings goal", id);
    }

    private static final String COMMITMENTS = """
            SELECT c.id, c.name, c.account_id, a.name AS account_name, a.currency,
                   c.direction, c.amount, c.frequency, c.first_date, c.active, a.is_active AS account_active
            FROM recurring_commitments c JOIN financial_accounts a ON a.id = c.account_id
            WHERE c.user_id = :userId
            """;

    private Commitment lockCommitment(User user, UUID id) {
        return jdbc.sql(COMMITMENTS + " AND c.id = :id FOR UPDATE OF c").param("userId", user.getId()).param("id", id)
                .query(Commitment.class).optional().orElseThrow(() -> new ResourceNotFoundException("Recurring commitment", "id", id));
    }

    private JdbcClient.StatementSpec matchingTransactions(User user, Commitment commitment, LocalDate date, String suffix) {
        return jdbc.sql("""
                SELECT t.id, t.description, t.transaction_date AS date, t.amount
                FROM transactions t
                WHERE t.user_id = :userId AND t.account_id = :accountId AND NOT t.is_transfer
                    AND t.direction = :direction AND t.currency = :currency
                    AND t.transaction_date BETWEEN :startDate AND :endDate
                """ + suffix).param("userId", user.getId()).param("accountId", commitment.accountId())
                .param("direction", commitment.direction().name()).param("currency", commitment.currency())
                .param("startDate", date.minusDays(MATCH_DAYS)).param("endDate", date.plusDays(MATCH_DAYS));
    }

    private static void checkOccurrence(Commitment commitment, LocalDate date) {
        if (!commitment.active() || !commitment.accountActive() || !commitment.frequency().occursOn(commitment.firstDate(), date)) {
            throw new BusinessException("INVALID_OCCURRENCE", "Choose an occurrence from an active schedule.");
        }
    }

    private static void requireUpdated(int count, String resource, UUID id) {
        if (count == 0) {
            throw new ResourceNotFoundException(resource, "id", id);
        }
    }

    private static void requireCurrency(String currency) {
        try {
            Currency.getInstance(currency);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException("INVALID_CURRENCY", "Use a valid three-letter currency code.");
        }
    }

    private record OccurrenceKey(UUID id, LocalDate date) {}
}
