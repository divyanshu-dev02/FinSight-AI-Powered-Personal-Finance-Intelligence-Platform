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

    Page<Transaction> findByUserOrderByTransactionDateDescCreatedAtDesc(User user, Pageable pageable);

    Optional<Transaction> findByIdAndUser(UUID id, User user);

    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM Transaction t " +
           "WHERE t.account = :account AND t.direction = :direction")
    BigDecimal sumAmountByAccountAndDirection(
            @Param("account") FinancialAccount account,
            @Param("direction") TransactionDirection direction);

    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM Transaction t " +
           "WHERE t.user = :user AND t.direction = :direction " +
           "AND t.transactionDate BETWEEN :startDate AND :endDate")
    BigDecimal sumAmountByUserAndDirectionAndDateRange(
            @Param("user") User user,
            @Param("direction") TransactionDirection direction,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("SELECT t.category.id, t.category.name, t.category.icon, t.category.color, COALESCE(SUM(t.amount), 0) " +
           "FROM Transaction t " +
           "WHERE t.user = :user AND t.direction = :direction " +
           "AND t.transactionDate BETWEEN :startDate AND :endDate " +
           "GROUP BY t.category.id, t.category.name, t.category.icon, t.category.color " +
           "ORDER BY SUM(t.amount) DESC")
    List<Object[]> sumAmountGroupedByCategory(
            @Param("user") User user,
            @Param("direction") TransactionDirection direction,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    boolean existsByExternalFingerprintAndUser(String externalFingerprint, User user);
}

