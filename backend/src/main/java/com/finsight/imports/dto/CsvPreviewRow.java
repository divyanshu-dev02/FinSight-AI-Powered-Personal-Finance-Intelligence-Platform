package com.finsight.imports.dto;

import com.finsight.transactions.entity.TransactionDirection;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CsvPreviewRow(
    int rowNumber,
    LocalDate date,
    String description,
    String merchant,
    BigDecimal amount,
    TransactionDirection direction,
    String categoryName,
    boolean duplicate,
    String validationError
) {}
