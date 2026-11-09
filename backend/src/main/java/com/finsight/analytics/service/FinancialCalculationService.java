package com.finsight.analytics.service;

import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.accounts.repository.FinancialAccountRepository;
import com.finsight.analytics.dto.FinancialSummaryResponse;
import com.finsight.identity.entity.User;
import com.finsight.transactions.entity.TransactionDirection;
import com.finsight.transactions.repository.TransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class FinancialCalculationService {

    private final FinancialAccountRepository accountRepository;
    private final TransactionRepository transactionRepository;

    public FinancialCalculationService(FinancialAccountRepository accountRepository,
                                       TransactionRepository transactionRepository) {
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
    }

    /**
     * Calculates the real-time balance of an account:
     * Balance = OpeningBalance + Sum(CREDIT) - Sum(DEBIT)
     */
    public BigDecimal calculateAccountBalance(FinancialAccount account) {
        BigDecimal credits = transactionRepository.sumAmountByAccountAndDirection(account, TransactionDirection.CREDIT);
        BigDecimal debits = transactionRepository.sumAmountByAccountAndDirection(account, TransactionDirection.DEBIT);

        return account.getOpeningBalance()
                .add(credits)
                .subtract(debits)
                .setScale(4, RoundingMode.HALF_UP);
    }

    /**
     * Calculates user monthly financial summary:
     * - Net worth = sum of all account current balances
     * - Monthly income = sum of credits in current month
     * - Monthly expense = sum of debits in current month
     * - Net cash flow = income - expense
     * - Savings rate = (net cash flow / income) * 100
     */
    public FinancialSummaryResponse calculateMonthlySummary(User user, YearMonth yearMonth) {
        YearMonth targetMonth = (yearMonth != null) ? yearMonth : YearMonth.now();
        LocalDate startDate = targetMonth.atDay(1);
        LocalDate endDate = targetMonth.atEndOfMonth();

        // 1. Calculate Net Worth
        List<FinancialAccount> accounts = accountRepository.findByUserAndActiveTrueOrderByCreatedAtDesc(user);
        BigDecimal totalNetWorth = BigDecimal.ZERO;
        for (FinancialAccount acc : accounts) {
            totalNetWorth = totalNetWorth.add(calculateAccountBalance(acc));
        }

        // 2. Total Monthly Income & Expenses
        BigDecimal totalIncome = transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                user, TransactionDirection.CREDIT, startDate, endDate);
        BigDecimal totalExpense = transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                user, TransactionDirection.DEBIT, startDate, endDate);

        // 3. Net Cash Flow
        BigDecimal netCashFlow = totalIncome.subtract(totalExpense).setScale(4, RoundingMode.HALF_UP);

        // 4. Savings Rate: (Net Cash Flow / Income) * 100
        BigDecimal savingsRate;
        if (totalIncome.compareTo(BigDecimal.ZERO) > 0) {
            savingsRate = netCashFlow
                    .multiply(BigDecimal.valueOf(100))
                    .divide(totalIncome, 2, RoundingMode.HALF_UP);
        } else {
            savingsRate = BigDecimal.ZERO;
        }

        // 5. Category Breakdown
        List<Object[]> rawCategories = transactionRepository.sumAmountGroupedByCategory(
                user, TransactionDirection.DEBIT, startDate, endDate);

        List<FinancialSummaryResponse.CategorySpendingResponse> breakdown = new ArrayList<>();
        for (Object[] row : rawCategories) {
            UUID catId = (UUID) row[0];
            String catName = (String) row[1];
            String icon = (String) row[2];
            String color = (String) row[3];
            BigDecimal spent = (BigDecimal) row[4];

            BigDecimal percentage = BigDecimal.ZERO;
            if (totalExpense.compareTo(BigDecimal.ZERO) > 0) {
                percentage = spent.multiply(BigDecimal.valueOf(100))
                        .divide(totalExpense, 2, RoundingMode.HALF_UP);
            }

            breakdown.add(new FinancialSummaryResponse.CategorySpendingResponse(
                    catId, catName, icon, color, spent, percentage));
        }

        return new FinancialSummaryResponse(
                totalNetWorth.setScale(4, RoundingMode.HALF_UP),
                totalIncome.setScale(4, RoundingMode.HALF_UP),
                totalExpense.setScale(4, RoundingMode.HALF_UP),
                netCashFlow,
                savingsRate,
                user.getBaseCurrency(),
                breakdown
        );
    }
}

