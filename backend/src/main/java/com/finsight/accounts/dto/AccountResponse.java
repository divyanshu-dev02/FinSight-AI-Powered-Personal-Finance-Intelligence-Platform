package com.finsight.accounts.dto;

import com.finsight.accounts.entity.AccountType;
import com.finsight.accounts.entity.FinancialAccount;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record AccountResponse(
    UUID id,
    String name,
    AccountType type,
    String currency,
    BigDecimal openingBalance,
    BigDecimal currentBalance,
    String institutionLabel,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
    public static AccountResponse fromEntity(FinancialAccount account, BigDecimal currentBalance) {
        return new AccountResponse(
            account.getId(),
            account.getName(),
            account.getType(),
            account.getCurrency(),
            account.getOpeningBalance(),
            currentBalance != null ? currentBalance : account.getOpeningBalance(),
            account.getInstitutionLabel(),
            account.isActive(),
            account.getCreatedAt(),
            account.getUpdatedAt()
        );
    }
}

