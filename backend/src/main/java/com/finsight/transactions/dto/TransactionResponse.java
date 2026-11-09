package com.finsight.transactions.dto;

import com.finsight.transactions.entity.Transaction;
import com.finsight.transactions.entity.TransactionDirection;
import com.finsight.transactions.entity.TransactionSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record TransactionResponse(
    UUID id,
    UUID accountId,
    String accountName,
    UUID categoryId,
    String categoryName,
    String categoryIcon,
    String categoryColor,
    BigDecimal amount,
    String currency,
    TransactionDirection direction,
    String description,
    String merchant,
    LocalDate transactionDate,
    LocalDate postedDate,
    TransactionSource source,
    String notes,
    Instant createdAt
) {
    public static TransactionResponse fromEntity(Transaction t) {
        return new TransactionResponse(
            t.getId(),
            t.getAccount().getId(),
            t.getAccount().getName(),
            t.getCategory() != null ? t.getCategory().getId() : null,
            t.getCategory() != null ? t.getCategory().getName() : null,
            t.getCategory() != null ? t.getCategory().getIcon() : null,
            t.getCategory() != null ? t.getCategory().getColor() : null,
            t.getAmount(),
            t.getCurrency(),
            t.getDirection(),
            t.getDescription(),
            t.getMerchant(),
            t.getTransactionDate(),
            t.getPostedDate(),
            t.getSource(),
            t.getNotes(),
            t.getCreatedAt()
        );
    }
}

