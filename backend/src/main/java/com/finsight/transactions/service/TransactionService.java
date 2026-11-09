package com.finsight.transactions.service;

import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.accounts.service.AccountService;
import com.finsight.categories.entity.Category;
import com.finsight.categories.service.CategoryService;
import com.finsight.common.exception.ResourceNotFoundException;
import com.finsight.identity.entity.User;
import com.finsight.transactions.dto.CreateTransactionRequest;
import com.finsight.transactions.dto.TransactionResponse;
import com.finsight.transactions.dto.UpdateTransactionRequest;
import com.finsight.transactions.entity.Transaction;
import com.finsight.transactions.entity.TransactionSource;
import com.finsight.transactions.repository.TransactionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final AccountService accountService;
    private final CategoryService categoryService;

    public TransactionService(TransactionRepository transactionRepository,
                              AccountService accountService,
                              CategoryService categoryService) {
        this.transactionRepository = transactionRepository;
        this.accountService = accountService;
        this.categoryService = categoryService;
    }

    public Page<TransactionResponse> getTransactionsForUser(User user, Pageable pageable) {
        return transactionRepository.findByUserOrderByTransactionDateDescCreatedAtDesc(user, pageable)
                .map(TransactionResponse::fromEntity);
    }

    public TransactionResponse getTransactionById(UUID id, User user) {
        Transaction transaction = findTransactionOrThrow(id, user);
        return TransactionResponse.fromEntity(transaction);
    }

    @Transactional
    public TransactionResponse createTransaction(CreateTransactionRequest request, User user) {
        FinancialAccount account = accountService.findAccountOrThrow(request.accountId(), user);

        Category category = null;
        if (request.categoryId() != null) {
            category = categoryService.findCategoryOrThrow(request.categoryId(), user);
        }

        String currency = (request.currency() != null && !request.currency().isBlank())
                ? request.currency().trim().toUpperCase()
                : account.getCurrency();

        Transaction transaction = new Transaction(
                user,
                account,
                category,
                request.amount(),
                currency,
                request.direction(),
                request.description().trim(),
                request.merchant() != null ? request.merchant().trim() : null,
                request.transactionDate(),
                TransactionSource.MANUAL
        );

        transaction.setPostedDate(request.postedDate());
        transaction.setNotes(request.notes());

        Transaction saved = transactionRepository.save(transaction);
        return TransactionResponse.fromEntity(saved);
    }

    @Transactional
    public TransactionResponse updateTransaction(UUID id, UpdateTransactionRequest request, User user) {
        Transaction transaction = findTransactionOrThrow(id, user);

        if (request.accountId() != null) {
            FinancialAccount account = accountService.findAccountOrThrow(request.accountId(), user);
            transaction.setAccount(account);
        }

        if (request.categoryId() != null) {
            Category category = categoryService.findCategoryOrThrow(request.categoryId(), user);
            transaction.setCategory(category);
        }

        if (request.amount() != null) {
            transaction.setAmount(request.amount());
        }

        if (request.direction() != null) {
            transaction.setDirection(request.direction());
        }

        if (request.description() != null && !request.description().isBlank()) {
            transaction.setDescription(request.description().trim());
        }

        if (request.merchant() != null) {
            transaction.setMerchant(request.merchant().trim());
        }

        if (request.transactionDate() != null) {
            transaction.setTransactionDate(request.transactionDate());
        }

        if (request.postedDate() != null) {
            transaction.setPostedDate(request.postedDate());
        }

        if (request.notes() != null) {
            transaction.setNotes(request.notes());
        }

        Transaction updated = transactionRepository.save(transaction);
        return TransactionResponse.fromEntity(updated);
    }

    @Transactional
    public void deleteTransaction(UUID id, User user) {
        Transaction transaction = findTransactionOrThrow(id, user);
        transactionRepository.delete(transaction);
    }

    public Transaction findTransactionOrThrow(UUID id, User user) {
        return transactionRepository.findByIdAndUser(id, user)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction", "id", id));
    }
}

