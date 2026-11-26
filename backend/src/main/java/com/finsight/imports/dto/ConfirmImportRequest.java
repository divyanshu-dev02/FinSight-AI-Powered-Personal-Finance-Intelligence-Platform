package com.finsight.imports.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

public record ConfirmImportRequest(
    @NotNull(message = "File token is required")
    UUID fileToken,

    @NotNull(message = "Account ID is required")
    UUID accountId,

    CsvColumnMapping mapping,

    boolean skipDuplicates,

    @Size(max = 10_000) List<@NotNull @Valid RowReview> reviews
) {
    public record RowReview(@Positive int rowNumber, UUID categoryId, boolean saveRule) {}
}
