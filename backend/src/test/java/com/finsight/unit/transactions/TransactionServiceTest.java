package com.finsight.unit.transactions;

import com.finsight.accounts.entity.AccountType;
import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.accounts.service.AccountService;
import com.finsight.categories.service.CategoryService;
import com.finsight.identity.entity.User;
import com.finsight.transactions.dto.CreateTransactionRequest;
import com.finsight.transactions.dto.TransactionResponse;
import com.finsight.transactions.entity.Transaction;
import com.finsight.transactions.entity.TransactionDirection;
import com.finsight.transactions.entity.TransactionSource;
import com.finsight.transactions.repository.TransactionRepository;
import com.finsight.transactions.service.TransactionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TransactionServiceTest {

    @Mock
    private TransactionRepository transactionRepository;

    @Mock
    private AccountService accountService;

    @Mock
    private CategoryService categoryService;

    private TransactionService transactionService;

    private User testUser;
    private FinancialAccount activeAccount;

    @BeforeEach
    void setUp() {
        transactionService = new TransactionService(transactionRepository, accountService, categoryService);
        testUser = new User(UUID.randomUUID(), "test@finsight.local", "hash", "Test User");
        activeAccount = new FinancialAccount(testUser, "Main Checking", AccountType.BANK_ACCOUNT, "INR",
                new BigDecimal("10000.0000"), "HDFC");
    }

    @Test
    @DisplayName("By default, getTransactionsForUser should only query active accounts")
    void shouldOnlyQueryActiveAccountsByDefault() {
        Pageable pageable = PageRequest.of(0, 10);
        when(transactionRepository.findByUserAndAccountActiveTrueOrderByTransactionDateDescCreatedAtDesc(testUser, pageable))
                .thenReturn(new PageImpl<>(List.of()));

        Page<TransactionResponse> result = transactionService.getTransactionsForUser(testUser, pageable);

        assertThat(result).isNotNull();
        verify(transactionRepository, times(1))
                .findByUserAndAccountActiveTrueOrderByTransactionDateDescCreatedAtDesc(testUser, pageable);
        verify(transactionRepository, never())
                .findByUserOrderByTransactionDateDescCreatedAtDesc(any(), any());
    }

    @Test
    @DisplayName("When includeArchived is true, getTransactionsForUser should query all accounts")
    void shouldQueryAllAccountsWhenIncludeArchivedIsTrue() {
        Pageable pageable = PageRequest.of(0, 10);
        when(transactionRepository.findByUserOrderByTransactionDateDescCreatedAtDesc(testUser, pageable))
                .thenReturn(new PageImpl<>(List.of()));

        Page<TransactionResponse> result = transactionService.getTransactionsForUser(testUser, true, pageable);

        assertThat(result).isNotNull();
        verify(transactionRepository, times(1))
                .findByUserOrderByTransactionDateDescCreatedAtDesc(testUser, pageable);
        verify(transactionRepository, never())
                .findByUserAndAccountActiveTrueOrderByTransactionDateDescCreatedAtDesc(any(), any());
    }

    @Test
    @DisplayName("Should create manual transaction successfully")
    void shouldCreateTransactionSuccessfully() {
        CreateTransactionRequest request = new CreateTransactionRequest(
                activeAccount.getId(),
                null,
                new BigDecimal("500.0000"),
                "INR",
                TransactionDirection.DEBIT,
                "Lunch at cafe",
                "Cafe Coffee",
                LocalDate.of(2026, 11, 15),
                null,
                "Cash expense"
        );

        when(accountService.findAccountOrThrow(activeAccount.getId(), testUser)).thenReturn(activeAccount);
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(invocation -> {
            Transaction t = invocation.getArgument(0);
            return t;
        });

        TransactionResponse response = transactionService.createTransaction(request, testUser);

        assertThat(response).isNotNull();
        assertThat(response.amount()).isEqualByComparingTo("500.0000");
        assertThat(response.description()).isEqualTo("Lunch at cafe");
        assertThat(response.accountActive()).isTrue();
    }
}
