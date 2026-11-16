package com.finsight.imports.dto;

import java.util.List;

public record CsvPreviewResponse(
    String fileToken,
    String fileName,
    String fileHash,
    List<String> detectedHeaders,
    CsvColumnMapping suggestedMapping,
    List<CsvPreviewRow> previewRows,
    int totalRows,
    int validRows,
    int duplicateRows,
    int errorRows
) {}
