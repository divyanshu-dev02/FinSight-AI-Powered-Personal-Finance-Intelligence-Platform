package com.finsight.analytics.service;

import com.finsight.accounts.entity.AccountType;
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
    private final CurrencyConversionService currencyConverter;

    public FinancialCalculationService(FinancialAccountRepository accountRepository,
                                       TransactionRepository transactionRepository,
                                       CurrencyConversionService currencyConverter) {
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
        this.currencyConverter = currencyConverter;
    }

    /**
     * Calculates the real-time balance of an account in its native currency:
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
     * - Multi-currency normalization into user base currency
     * - Accurate Net worth = Assets - Liabilities (subtracting loans and credit card debts)
     * - Excludes internal transfers from Income and Spending
     * - Month-over-month comparison against previous month
     */
    public FinancialSummaryResponse calculateMonthlySummary(User user, YearMonth yearMonth) {
        YearMonth targetMonth = (yearMonth != null) ? yearMonth : YearMonth.now();
        LocalDate startDate = targetMonth.atDay(1);
        LocalDate endDate = targetMonth.atEndOfMonth();
        String baseCurrency = user.getBaseCurrency() != null ? user.getBaseCurrency() : "INR";

        // 1. Calculate Net Worth, Total Assets & Total Liabilities (with multi-currency conversion)
        List<FinancialAccount> accounts = accountRepository.findByUserAndActiveTrueOrderByCreatedAtDesc(user);
        BigDecimal totalAssets = BigDecimal.ZERO;
        BigDecimal totalLiabilities = BigDecimal.ZERO;

        for (FinancialAccount acc : accounts) {
            BigDecimal nativeBalance = calculateAccountBalance(acc);
            BigDecimal convertedBalance = currencyConverter.convert(nativeBalance, acc.getCurrency(), baseCurrency);

            if (acc.getType() == AccountType.LOAN) {
                // Loans are liabilities to be subtracted from Net Worth
                totalLiabilities = totalLiabilities.add(convertedBalance.abs());
            } else if (acc.getType() == AccountType.CREDIT_CARD) {
                if (convertedBalance.compareTo(BigDecimal.ZERO) < 0) {
                    totalLiabilities = totalLiabilities.add(convertedBalance.abs());
                } else {
                    totalAssets = totalAssets.add(convertedBalance);
                }
            } else {
                if (convertedBalance.compareTo(BigDecimal.ZERO) >= 0) {
                    totalAssets = totalAssets.add(convertedBalance);
                } else {
                    totalLiabilities = totalLiabilities.add(convertedBalance.abs());
                }
            }
        }

        BigDecimal totalNetWorth = totalAssets.subtract(totalLiabilities).setScale(4, RoundingMode.HALF_UP);

        // 2. Total Monthly Income & Expenses (excluding transfers)
        BigDecimal totalIncome = transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                user, TransactionDirection.CREDIT, startDate, endDate);
        if (totalIncome == null) totalIncome = BigDecimal.ZERO;

        BigDecimal totalExpense = transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                user, TransactionDirection.DEBIT, startDate, endDate);
        if (totalExpense == null) totalExpense = BigDecimal.ZERO;

        // 3. Net Cash Flow
        BigDecimal netCashFlow = totalIncome.subtract(totalExpense).setScale(4, RoundingMode.HALF_UP);

        // 4. Savings Rate: (Net Cash Flow / Income) * 100
        BigDecimal savingsRate = BigDecimal.ZERO;
        if (totalIncome.compareTo(BigDecimal.ZERO) > 0) {
            savingsRate = netCashFlow
                    .multiply(BigDecimal.valueOf(100))
                    .divide(totalIncome, 2, RoundingMode.HALF_UP);
        }

        // 5. Previous Month Comparison
        YearMonth previousMonth = targetMonth.minusMonths(1);
        LocalDate prevStartDate = previousMonth.atDay(1);
        LocalDate prevEndDate = previousMonth.atEndOfMonth();

        BigDecimal prevIncome = transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                user, TransactionDirection.CREDIT, prevStartDate, prevEndDate);
        if (prevIncome == null) prevIncome = BigDecimal.ZERO;

        BigDecimal prevExpense = transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                user, TransactionDirection.DEBIT, prevStartDate, prevEndDate);
        if (prevExpense == null) prevExpense = BigDecimal.ZERO;

        BigDecimal prevSavingsRate = BigDecimal.ZERO;
        if (prevIncome.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal prevNetCashFlow = prevIncome.subtract(prevExpense);
            prevSavingsRate = prevNetCashFlow.multiply(BigDecimal.valueOf(100))
                    .divide(prevIncome, 2, RoundingMode.HALF_UP);
        }

        BigDecimal incomeChangePercentage = null;
        if (prevIncome.compareTo(BigDecimal.ZERO) > 0) {
            incomeChangePercentage = totalIncome.subtract(prevIncome)
                    .multiply(BigDecimal.valueOf(100))
                    .divide(prevIncome, 2, RoundingMode.HALF_UP);
        }

        BigDecimal expenseChangePercentage = null;
        if (prevExpense.compareTo(BigDecimal.ZERO) > 0) {
            expenseChangePercentage = totalExpense.subtract(prevExpense)
                    .multiply(BigDecimal.valueOf(100))
                    .divide(prevExpense, 2, RoundingMode.HALF_UP);
        }

        BigDecimal savingsRateChange = savingsRate.subtract(prevSavingsRate).setScale(2, RoundingMode.HALF_UP);

        // 6. Category Breakdown
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
                totalNetWorth,
                totalAssets.setScale(4, RoundingMode.HALF_UP),
                totalLiabilities.setScale(4, RoundingMode.HALF_UP),
                totalIncome.setScale(4, RoundingMode.HALF_UP),
                totalExpense.setScale(4, RoundingMode.HALF_UP),
                netCashFlow,
                savingsRate,
                baseCurrency,
                targetMonth.toString(),
                prevIncome.setScale(4, RoundingMode.HALF_UP),
                prevExpense.setScale(4, RoundingMode.HALF_UP),
                incomeChangePercentage,
                expenseChangePercentage,
                savingsRateChange,
                breakdown
        );
    }
}
