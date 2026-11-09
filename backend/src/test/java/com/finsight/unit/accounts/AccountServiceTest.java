package com.finsight.unit.accounts;

import com.finsight.accounts.dto.AccountResponse;
import com.finsight.accounts.dto.CreateAccountRequest;
import com.finsight.accounts.entity.AccountType;
import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.accounts.repository.FinancialAccountRepository;
import com.finsight.accounts.service.AccountService;
import com.finsight.common.exception.BusinessException;
import com.finsight.identity.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private FinancialAccountRepository accountRepository;

    private AccountService accountService;

    @BeforeEach
    void setUp() {
        accountService = new AccountService(accountRepository);
    }

    @Test
    @DisplayName("Should successfully create a financial account")
    void shouldCreateAccount() {
        User user = new User(UUID.randomUUID(), "user@finsight.local", "hash", "User");
        CreateAccountRequest request = new CreateAccountRequest(
                "Savings Account",
                AccountType.BANK_ACCOUNT,
                "INR",
                new BigDecimal("10000.0000"),
                "State Bank"
        );

        when(accountRepository.existsByNameIgnoreCaseAndUserAndActiveTrue("Savings Account", user)).thenReturn(false);
        when(accountRepository.save(any(FinancialAccount.class))).thenAnswer(inv -> inv.getArgument(0));

        AccountResponse response = accountService.createAccount(request, user);

        assertThat(response).isNotNull();
        assertThat(response.name()).isEqualTo("Savings Account");
        assertThat(response.openingBalance()).isEqualByComparingTo("10000.0000");
        assertThat(response.currency()).isEqualTo("INR");
        verify(accountRepository).save(any(FinancialAccount.class));
    }

    @Test
    @DisplayName("Should reject creating an account with duplicate name for same user")
    void shouldRejectDuplicateAccountName() {
        User user = new User(UUID.randomUUID(), "user@finsight.local", "hash", "User");
        CreateAccountRequest request = new CreateAccountRequest(
                "Duplicate Account",
                AccountType.BANK_ACCOUNT,
                "INR",
                BigDecimal.ZERO,
                null
        );

        when(accountRepository.existsByNameIgnoreCaseAndUserAndActiveTrue("Duplicate Account", user)).thenReturn(true);

        assertThatThrownBy(() -> accountService.createAccount(request, user))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already exists");

        verify(accountRepository, never()).save(any());
    }
}

