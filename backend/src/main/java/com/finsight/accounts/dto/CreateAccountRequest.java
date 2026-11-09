package com.finsight.accounts.dto;

import com.finsight.accounts.entity.AccountType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record CreateAccountRequest(
    @NotBlank(message = "Account name is required")
    @Size(min = 2, max = 100, message = "Account name must be between 2 and 100 characters")
    String name,

    @NotNull(message = "Account type is required")
    AccountType type,

    @Size(min = 3, max = 3, message = "Currency must be a 3-character ISO code")
    String currency,

    BigDecimal openingBalance,

    @Size(max = 100, message = "Institution label cannot exceed 100 characters")
    String institutionLabel
) {}

