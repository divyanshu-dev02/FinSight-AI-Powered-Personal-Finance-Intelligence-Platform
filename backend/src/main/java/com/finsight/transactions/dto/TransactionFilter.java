package com.finsight.transactions.dto;

import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public record TransactionFilter(UUID accountId, UUID categoryId, LocalDate from, LocalDate to, Type type,
                                @Size(max = 120) String search, @Size(max = 100) String merchant) {
    public enum Type { EXPENSE, INCOME, TRANSFER }

    public boolean isEmpty() {
        return accountId == null && categoryId == null && from == null && to == null
                && type == null && (search == null || search.isBlank()) && (merchant == null || merchant.isBlank());
    }
}
