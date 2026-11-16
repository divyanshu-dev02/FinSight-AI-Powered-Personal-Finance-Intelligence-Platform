package com.finsight.imports.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record ConfirmImportRequest(
    @NotBlank(message = "File token is required")
    String fileToken,

    @NotNull(message = "Account ID is required")
    UUID accountId,

    CsvColumnMapping mapping,

    boolean skipDuplicates
) {}
