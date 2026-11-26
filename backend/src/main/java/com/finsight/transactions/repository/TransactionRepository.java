package com.finsight.transactions.repository;

import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.identity.entity.User;
import com.finsight.transactions.entity.Transaction;
import com.finsight.transactions.entity.TransactionDirection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

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

    @Query("SELECT t.currency AS currency, SUM(t.amount) AS amount " + EXPENSE_SCOPE
            + " GROUP BY t.currency ORDER BY t.currency")
    List<CurrencyTotal> spendingByCurrency(User user, LocalDate start, LocalDate end);

    @Query("SELECT t " + EXPENSE_SCOPE + " ORDER BY t.transactionDate DESC, t.id")
    List<Transaction> recentExpenses(User user, LocalDate start, LocalDate end, Pageable pageable);

    boolean existsByExternalFingerprintAndUser(String externalFingerprint, User user);
}

