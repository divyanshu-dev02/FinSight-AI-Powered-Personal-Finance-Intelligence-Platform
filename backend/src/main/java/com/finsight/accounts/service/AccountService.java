package com.finsight.accounts.service;

import com.finsight.accounts.dto.AccountResponse;
import com.finsight.accounts.dto.CreateAccountRequest;
import com.finsight.accounts.dto.UpdateAccountRequest;
import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.accounts.repository.FinancialAccountRepository;
import com.finsight.common.exception.BusinessException;
import com.finsight.common.exception.ResourceNotFoundException;
import com.finsight.identity.entity.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class AccountService {

    private final FinancialAccountRepository accountRepository;

    public AccountService(FinancialAccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    public List<AccountResponse> getAccountsForUser(User user) {
        return accountRepository.findByUserAndActiveTrueOrderByCreatedAtDesc(user).stream()
                .map(acc -> AccountResponse.fromEntity(acc, acc.getOpeningBalance()))
                .toList();
    }

    public AccountResponse getAccountById(UUID accountId, User user) {
        FinancialAccount account = findAccountOrThrow(accountId, user);
        return AccountResponse.fromEntity(account, account.getOpeningBalance());
    }

    @Transactional
    public AccountResponse createAccount(CreateAccountRequest request, User user) {
        if (accountRepository.existsByNameIgnoreCaseAndUserAndActiveTrue(request.name().trim(), user)) {
            throw new BusinessException("DUPLICATE_ACCOUNT_NAME", "An active account with this name already exists");
        }

        BigDecimal openingBalance = request.openingBalance() != null ? request.openingBalance() : BigDecimal.ZERO;
        String currency = (request.currency() != null && !request.currency().isBlank())
                ? request.currency().trim().toUpperCase()
                : user.getBaseCurrency();

        FinancialAccount account = new FinancialAccount(
                user,
                request.name().trim(),
                request.type(),
                currency,
                openingBalance,
                request.institutionLabel() != null ? request.institutionLabel().trim() : null
        );

        FinancialAccount saved = accountRepository.save(account);
        return AccountResponse.fromEntity(saved, saved.getOpeningBalance());
    }

    @Transactional
    public AccountResponse updateAccount(UUID accountId, UpdateAccountRequest request, User user) {
        FinancialAccount account = findAccountOrThrow(accountId, user);

        if (request.name() != null && !request.name().isBlank()) {
            String newName = request.name().trim();
            if (!newName.equalsIgnoreCase(account.getName()) &&
                accountRepository.existsByNameIgnoreCaseAndUserAndActiveTrue(newName, user)) {
                throw new BusinessException("DUPLICATE_ACCOUNT_NAME", "An active account with this name already exists");
            }
            account.setName(newName);
        }

        if (request.type() != null) {
            account.setType(request.type());
        }

        if (request.institutionLabel() != null) {
            account.setInstitutionLabel(request.institutionLabel().trim());
        }

        if (request.active() != null) {
            account.setActive(request.active());
        }

        FinancialAccount updated = accountRepository.save(account);
        return AccountResponse.fromEntity(updated, updated.getOpeningBalance());
    }

    @Transactional
    public void deleteAccount(UUID accountId, User user) {
        FinancialAccount account = findAccountOrThrow(accountId, user);
        account.setActive(false); // Soft delete
        accountRepository.save(account);
    }

    public FinancialAccount findAccountOrThrow(UUID accountId, User user) {
        return accountRepository.findByIdAndUser(accountId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Account", "id", accountId));
    }
}

