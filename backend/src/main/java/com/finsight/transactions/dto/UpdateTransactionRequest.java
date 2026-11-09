package com.finsight.transactions.dto;

import com.finsight.transactions.entity.TransactionDirection;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record UpdateTransactionRequest(
    UUID accountId,
    UUID categoryId,

    @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
    BigDecimal amount,

    TransactionDirection direction,

    @Size(min = 1, max = 255, message = "Description must not exceed 255 characters")
    String description,

    @Size(max = 100, message = "Merchant name must not exceed 100 characters")
    String merchant,

    LocalDate transactionDate,
    LocalDate postedDate,
    String notes
) {}

