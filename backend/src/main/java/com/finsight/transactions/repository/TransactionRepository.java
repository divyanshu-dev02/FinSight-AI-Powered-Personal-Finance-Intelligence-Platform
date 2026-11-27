package com.finsight.transactions.repository;

import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.identity.entity.User;
import com.finsight.transactions.entity.Transaction;
import com.finsight.transactions.entity.TransactionDirection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, UUID>, JpaSpecificationExecutor<Transaction> {

    Page<Transaction> findByUserAndAccountActiveTrueOrderByTransactionDateDescCreatedAtDesc(User user, Pageable pageable);

    Page<Transaction> findByUserOrderByTransactionDateDescCreatedAtDesc(User user, Pageable pageable);

    List<Transaction> findByUserOrderByTransactionDateDescCreatedAtDesc(User user);

    Optional<Transaction> findByIdAndUser(UUID id, User user);

    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM Transaction t " +
           "WHERE t.account = :account AND t.direction = :direction")
    BigDecimal sumAmountByAccountAndDirection(
            @Param("account") FinancialAccount account,
            @Param("direction") TransactionDirection direction);

    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM Transaction t " +
           "WHERE t.user = :user AND t.direction = :direction " +
           "AND t.transactionDate BETWEEN :startDate AND :endDate " +
           "AND t.account.active = true " +
           "AND t.isTransfer = false")
    BigDecimal sumAmountByUserAndDirectionAndDateRange(
            @Param("user") User user,
            @Param("direction") TransactionDirection direction,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("SELECT t.category.id, t.category.name, t.category.icon, t.category.color, COALESCE(SUM(t.amount), 0) " +
           "FROM Transaction t " +
           "WHERE t.user = :user AND t.direction = :direction " +
           "AND t.transactionDate BETWEEN :startDate AND :endDate " +
           "AND t.account.active = true " +
           "AND t.isTransfer = false " +
           "GROUP BY t.category.id, t.category.name, t.category.icon, t.category.color " +
           "ORDER BY SUM(t.amount) DESC")
    List<Object[]> sumAmountGroupedByCategory(
            @Param("user") User user,
            @Param("direction") TransactionDirection direction,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    interface CurrencyTotal {
        String getCurrency();
        BigDecimal getAmount();
    }

    String EXPENSE_SCOPE = """
            FROM Transaction t
            WHERE t.user = :user AND t.direction = com.finsight.transactions.entity.TransactionDirection.DEBIT
              AND t.transactionDate BETWEEN :start AND :end
              AND t.account.active = true AND t.isTransfer = false
            """;

    interface SpendingBucket {
        String getBucket();
        UUID getCategoryId();
        String getCategoryName();
        String getMerchant();
        String getCurrency();
        BigDecimal getAmount();
    }

    @Query(value = """
            WITH spending AS (
                SELECT to_char(t.transaction_date, CASE WHEN :daily THEN 'YYYY-MM-DD' ELSE 'YYYY-MM' END) AS bucket,
                       c.id AS category_id, COALESCE(c.name, 'Uncategorized') AS category_name,
                       NULLIF(btrim(t.merchant), '') AS merchant_name,
                       lower(NULLIF(btrim(t.merchant), '')) AS merchant_key,
                       t.currency, t.amount
                FROM transactions t JOIN financial_accounts a ON a.id = t.account_id AND a.user_id = t.user_id
                LEFT JOIN categories c ON c.id = t.category_id AND (c.user_id IS NULL OR c.user_id = t.user_id)
                WHERE t.user_id = :userId AND a.is_active = true AND t.direction = 'DEBIT' AND t.is_transfer = false
                  AND t.transaction_date BETWEEN :start AND :end
            ), grouped AS (
                SELECT bucket, category_id, category_name, merchant_key, currency, SUM(amount) AS amount,
                       CASE WHEN GROUPING(merchant_key) = 0 THEN MIN(merchant_name) END AS merchant,
                       GROUPING(merchant_key) = 0 AS merchant_group
                FROM spending
                GROUP BY GROUPING SETS ((bucket, currency), (category_id, category_name, currency), (merchant_key, currency))
            ), ranked AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY currency, merchant_group ORDER BY amount DESC, merchant_key) AS rank
                FROM grouped WHERE NOT merchant_group OR merchant_key IS NOT NULL
            )
            SELECT bucket, category_id AS "categoryId", category_name AS "categoryName", merchant, currency, amount
            FROM ranked
            WHERE NOT merchant_group OR rank <= 8
            ORDER BY merchant_group, bucket NULLS LAST, currency, amount DESC, category_name, category_id, merchant_key
            """, nativeQuery = true)
    List<SpendingBucket> spendingTrend(UUID userId, LocalDate start, LocalDate end, boolean daily);

    @Query("SELECT t " + EXPENSE_SCOPE + " AND t.currency = :currency ORDER BY t.transactionDate DESC, t.createdAt DESC, t.id")
    Page<Transaction> spendingTransactions(User user, LocalDate start, LocalDate end, String currency, Pageable pageable);

    @Query("SELECT t.currency AS currency, SUM(t.amount) AS amount " + EXPENSE_SCOPE
            + " GROUP BY t.currency ORDER BY t.currency")
    List<CurrencyTotal> spendingByCurrency(User user, LocalDate start, LocalDate end);

    @Query("SELECT t " + EXPENSE_SCOPE + " ORDER BY t.transactionDate DESC, t.id")
    List<Transaction> recentExpenses(User user, LocalDate start, LocalDate end, Pageable pageable);

    @Query("SELECT t " + EXPENSE_SCOPE + " AND t.currency = :currency ORDER BY t.amount DESC, t.id")
    List<Transaction> largestExpenses(User user, LocalDate start, LocalDate end, String currency, Pageable pageable);

    boolean existsByExternalFingerprintAndUser(String externalFingerprint, User user);
}

