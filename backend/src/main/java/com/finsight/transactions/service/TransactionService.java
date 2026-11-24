package com.finsight.transactions.service;

import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.accounts.service.AccountService;
import com.finsight.categories.entity.Category;
import com.finsight.categories.service.CategoryService;
import com.finsight.common.exception.BusinessException;
import com.finsight.common.exception.ResourceNotFoundException;
import com.finsight.identity.entity.User;
import com.finsight.transactions.dto.CreateTransactionRequest;
import com.finsight.transactions.dto.CreateTransferRequest;
import com.finsight.transactions.dto.TransactionResponse;
import com.finsight.transactions.dto.UpdateTransactionRequest;
import com.finsight.transactions.entity.Transaction;
import com.finsight.transactions.entity.TransactionDirection;
import com.finsight.transactions.entity.TransactionSource;
import com.finsight.transactions.repository.TransactionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.List;
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

    public Page<TransactionResponse> getTransactionsForUser(User user, boolean includeArchived, Pageable pageable) {
        if (includeArchived) {
            return transactionRepository.findByUserOrderByTransactionDateDescCreatedAtDesc(user, pageable)
                    .map(TransactionResponse::fromEntity);
        } else {
            return transactionRepository.findByUserAndAccountActiveTrueOrderByTransactionDateDescCreatedAtDesc(user, pageable)
                    .map(TransactionResponse::fromEntity);
        }
    }

    public Page<TransactionResponse> getTransactionsForUser(User user, Pageable pageable) {
        return getTransactionsForUser(user, false, pageable);
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

    @Transactional
    public TransactionResponse createTransfer(CreateTransferRequest request, User user) {
        if (request.sourceAccountId().equals(request.destinationAccountId())) {
            throw new BusinessException("INVALID_TRANSFER", "Source and destination accounts must be different");
        }

        FinancialAccount sourceAccount = accountService.findAccountOrThrow(request.sourceAccountId(), user);
        FinancialAccount destinationAccount = accountService.findAccountOrThrow(request.destinationAccountId(), user);

        String description = (request.description() != null && !request.description().isBlank())
                ? request.description().trim()
                : "Transfer to " + destinationAccount.getName();

        // 1. Debit from source account
        Transaction debitTx = new Transaction(
                user,
                sourceAccount,
                null,
                request.amount(),
                sourceAccount.getCurrency(),
                TransactionDirection.DEBIT,
                description,
                null,
                request.transactionDate(),
                TransactionSource.MANUAL
        );
        debitTx.setNotes(request.notes());
        debitTx.setTransfer(true);
        debitTx.setTransferAccountId(destinationAccount.getId());
        Transaction savedDebit = transactionRepository.save(debitTx);

        // 2. Credit to destination account
        String destDesc = (request.description() != null && !request.description().isBlank())
                ? request.description().trim()
                : "Transfer from " + sourceAccount.getName();

        Transaction creditTx = new Transaction(
                user,
                destinationAccount,
                null,
                request.amount(),
                destinationAccount.getCurrency(),
                TransactionDirection.CREDIT,
                destDesc,
                null,
                request.transactionDate(),
                TransactionSource.MANUAL
        );
        creditTx.setNotes(request.notes());
        creditTx.setTransfer(true);
        creditTx.setTransferAccountId(sourceAccount.getId());
        creditTx.setTransferTransactionId(savedDebit.getId());
        Transaction savedCredit = transactionRepository.save(creditTx);

        // Link back
        savedDebit.setTransferTransactionId(savedCredit.getId());
        transactionRepository.save(savedDebit);

        return TransactionResponse.fromEntity(savedDebit);
    }

    public byte[] exportTransactionsCsv(User user) {
        List<Transaction> transactions = transactionRepository.findByUserOrderByTransactionDateDescCreatedAtDesc(user);
        StringBuilder sb = new StringBuilder();
        sb.append("ID,Date,Account,Category,Amount,Currency,Direction,Description,Merchant,IsTransfer,Source,Notes\n");

        for (Transaction tx : transactions) {
            sb.append('"').append(tx.getId()).append("\",");
            sb.append('"').append(tx.getTransactionDate()).append("\",");
            sb.append('"').append(escapeCsv(tx.getAccount().getName())).append("\",");
            sb.append('"').append(tx.getCategory() != null ? escapeCsv(tx.getCategory().getName()) : "Uncategorized").append("\",");
            sb.append(tx.getAmount().toPlainString()).append(',');
            sb.append('"').append(tx.getCurrency()).append("\",");
            sb.append('"').append(tx.getDirection()).append("\",");
            sb.append('"').append(escapeCsv(tx.getDescription())).append("\",");
            sb.append('"').append(tx.getMerchant() != null ? escapeCsv(tx.getMerchant()) : "").append("\",");
            sb.append(tx.isTransfer()).append(',');
            sb.append('"').append(tx.getSource()).append("\",");
            sb.append('"').append(tx.getNotes() != null ? escapeCsv(tx.getNotes()) : "").append("\"\n");
        }

        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private String escapeCsv(String val) {
        if (val == null) return "";
        return val.replace("\"", "\"\"");
    }

    public Transaction findTransactionOrThrow(UUID id, User user) {
        return transactionRepository.findByIdAndUser(id, user)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction", "id", id));
    }
}

