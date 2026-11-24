package com.finsight.transactions.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record CreateTransferRequest(
    @NotNull(message = "Source account ID is required")
    UUID sourceAccountId,

    @NotNull(message = "Destination account ID is required")
    UUID destinationAccountId,

    @NotNull(message = "Amount is required")
    @Positive(message = "Transfer amount must be greater than zero")
    BigDecimal amount,

    @NotNull(message = "Transfer date is required")
    LocalDate transactionDate,

    String description,
    String notes
) {}
