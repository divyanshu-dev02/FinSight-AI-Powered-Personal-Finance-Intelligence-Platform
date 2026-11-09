package com.finsight.accounts.dto;

import com.finsight.accounts.entity.AccountType;
import jakarta.validation.constraints.Size;

public record UpdateAccountRequest(
    @Size(min = 2, max = 100, message = "Account name must be between 2 and 100 characters")
    String name,

    AccountType type,

    @Size(max = 100, message = "Institution label cannot exceed 100 characters")
    String institutionLabel,

    Boolean active
) {}

