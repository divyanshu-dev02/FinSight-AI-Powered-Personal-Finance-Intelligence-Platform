package com.finsight.transactions.dto;

import com.finsight.transactions.entity.TransactionDirection;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record CreateTransactionRequest(
    @NotNull(message = "Account ID is required")
    UUID accountId,

    UUID categoryId,

    @NotNull(message = "Amount is required")
    @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
    BigDecimal amount,

    @Size(min = 3, max = 3, message = "Currency must be a 3-character ISO code")
    String currency,

    @NotNull(message = "Direction is required")
    TransactionDirection direction,

    @NotBlank(message = "Description is required")
    @Size(min = 1, max = 255, message = "Description must not exceed 255 characters")
    String description,

    @Size(max = 100, message = "Merchant name must not exceed 100 characters")
    String merchant,

    @NotNull(message = "Transaction date is required")
    LocalDate transactionDate,

    LocalDate postedDate,

    String notes
) {}

