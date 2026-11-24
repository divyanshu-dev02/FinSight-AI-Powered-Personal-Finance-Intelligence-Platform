package com.finsight.unit.analytics;

import com.finsight.accounts.entity.AccountType;
import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.accounts.repository.FinancialAccountRepository;
import com.finsight.analytics.dto.FinancialSummaryResponse;
import com.finsight.analytics.service.CurrencyConversionService;
import com.finsight.analytics.service.FinancialCalculationService;
import com.finsight.identity.entity.User;
import com.finsight.transactions.entity.TransactionDirection;
import com.finsight.transactions.repository.TransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FinancialCalculationServiceTest {

    @Mock
    private FinancialAccountRepository accountRepository;

    @Mock
    private TransactionRepository transactionRepository;

    private FinancialCalculationService calculationService;
    private CurrencyConversionService currencyConverter;

    @BeforeEach
    void setUp() {
        currencyConverter = new CurrencyConversionService();
        calculationService = new FinancialCalculationService(accountRepository, transactionRepository, currencyConverter);
    }

    @Test
    @DisplayName("Account balance should be opening balance + credits - debits")
    void shouldCalculateAccountBalanceAccurately() {
        User user = new User(UUID.randomUUID(), "test@finsight.local", "hash", "Test User");
        FinancialAccount account = new FinancialAccount(user, "Checking", AccountType.BANK_ACCOUNT, "INR",
                new BigDecimal("5000.0000"), "HDFC Bank");

        when(transactionRepository.sumAmountByAccountAndDirection(account, TransactionDirection.CREDIT))
                .thenReturn(new BigDecimal("25000.0000"));
        when(transactionRepository.sumAmountByAccountAndDirection(account, TransactionDirection.DEBIT))
                .thenReturn(new BigDecimal("8200.5000"));

        BigDecimal balance = calculationService.calculateAccountBalance(account);

        // 5000 + 25000 - 8200.50 = 21799.5000
        assertThat(balance).isEqualByComparingTo("21799.5000");
    }

    @Test
    @DisplayName("Net worth should subtract loans and convert multi-currency accounts")
    void shouldSubtractLoansAndConvertCurrenciesInNetWorth() {
        User user = new User(UUID.randomUUID(), "test@finsight.local", "hash", "Test User");
        user.setBaseCurrency("INR");

        // Checking in INR: balance 100,000
        FinancialAccount checking = new FinancialAccount(user, "Checking", AccountType.BANK_ACCOUNT, "INR",
                new BigDecimal("100000.0000"), "HDFC");
        // USD Savings: balance 1,000 USD -> 1000 * 86.50 = 86,500 INR
        FinancialAccount usdSavings = new FinancialAccount(user, "US Stocks", AccountType.BANK_ACCOUNT, "USD",
                new BigDecimal("1000.0000"), "Wise");
        // Home Loan: balance 50,000 INR (Liability)
        FinancialAccount loan = new FinancialAccount(user, "Car Loan", AccountType.LOAN, "INR",
                new BigDecimal("50000.0000"), "SBI");

        when(accountRepository.findByUserAndActiveTrueOrderByCreatedAtDesc(user))
                .thenReturn(List.of(checking, usdSavings, loan));

        when(transactionRepository.sumAmountByAccountAndDirection(any(), any()))
                .thenReturn(BigDecimal.ZERO);

        FinancialSummaryResponse summary = calculationService.calculateMonthlySummary(user, YearMonth.of(2026, 11));

        // Assets = 100,000 (checking) + 86,500 (usdSavings) = 186,500
        assertThat(summary.totalAssets()).isEqualByComparingTo("186500.0000");
        // Liabilities = 50,000 (loan)
        assertThat(summary.totalLiabilities()).isEqualByComparingTo("50000.0000");
        // Net Worth = 186,500 - 50,000 = 136,500
        assertThat(summary.totalNetWorth()).isEqualByComparingTo("136500.0000");
    }

    @Test
    @DisplayName("Monthly summary should compute income, expenses, cash flow, and savings rate")
    void shouldCalculateMonthlySummary() {
        User user = new User(UUID.randomUUID(), "test@finsight.local", "hash", "Test User");
        YearMonth month = YearMonth.of(2026, 11);

        when(accountRepository.findByUserAndActiveTrueOrderByCreatedAtDesc(user))
                .thenReturn(Collections.emptyList());

        when(transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                eq(user), eq(TransactionDirection.CREDIT), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(new BigDecimal("50000.0000"));

        when(transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                eq(user), eq(TransactionDirection.DEBIT), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(new BigDecimal("20000.0000"));

        List<Object[]> categoryList = new java.util.ArrayList<>();
        categoryList.add(new Object[]{UUID.randomUUID(), "Groceries", "cart", "#FF0000", new BigDecimal("10000.0000")});

        when(transactionRepository.sumAmountGroupedByCategory(
                eq(user), eq(TransactionDirection.DEBIT), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(categoryList);

        FinancialSummaryResponse summary = calculationService.calculateMonthlySummary(user, month);

        assertThat(summary.totalIncome()).isEqualByComparingTo("50000.0000");
        assertThat(summary.totalExpense()).isEqualByComparingTo("20000.0000");
        assertThat(summary.netCashFlow()).isEqualByComparingTo("30000.0000");
        // Savings rate = (30000 / 50000) * 100 = 60.00%
        assertThat(summary.savingsRatePercentage()).isEqualByComparingTo("60.00");
        assertThat(summary.categoryBreakdown()).hasSize(1);
        // Groceries is 10000 out of 20000 = 50.00%
        assertThat(summary.categoryBreakdown().get(0).percentageOfTotal()).isEqualByComparingTo("50.00");
    }

    @Test
    @DisplayName("Savings rate calculation should safely handle zero income without dividing by zero")
    void shouldHandleZeroIncomeSafely() {
        User user = new User(UUID.randomUUID(), "test@finsight.local", "hash", "Test User");

        when(accountRepository.findByUserAndActiveTrueOrderByCreatedAtDesc(user))
                .thenReturn(Collections.emptyList());

        when(transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                eq(user), eq(TransactionDirection.CREDIT), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(BigDecimal.ZERO);

        when(transactionRepository.sumAmountByUserAndDirectionAndDateRange(
                eq(user), eq(TransactionDirection.DEBIT), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(new BigDecimal("1500.0000"));

        when(transactionRepository.sumAmountGroupedByCategory(any(), any(), any(), any()))
                .thenReturn(Collections.emptyList());

        FinancialSummaryResponse summary = calculationService.calculateMonthlySummary(user, YearMonth.of(2026, 11));

        assertThat(summary.savingsRatePercentage()).isEqualByComparingTo("0");
        assertThat(summary.netCashFlow()).isEqualByComparingTo("-1500.0000");
    }
}
