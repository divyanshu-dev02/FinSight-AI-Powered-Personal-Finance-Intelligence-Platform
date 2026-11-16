package com.finsight.imports.dto;

public record CsvColumnMapping(
    String dateColumn,
    String descriptionColumn,
    String merchantColumn,
    String amountColumn,
    String debitColumn,
    String creditColumn,
    String categoryColumn,
    String dateFormat
) {
    public static CsvColumnMapping defaultMapping() {
        return new CsvColumnMapping(
            "date",
            "description",
            "merchant",
            "amount",
            null,
            null,
            "category",
            "yyyy-MM-dd"
        );
    }
}
