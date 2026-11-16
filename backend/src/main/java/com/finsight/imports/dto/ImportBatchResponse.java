package com.finsight.imports.dto;

import com.finsight.imports.entity.ImportBatch;
import com.finsight.imports.entity.ImportBatchStatus;

import java.time.Instant;
import java.util.UUID;

public record ImportBatchResponse(
    UUID id,
    String fileName,
    String fileHash,
    ImportBatchStatus status,
    int totalRows,
    int successfulRows,
    int failedRows,
    int duplicateRows,
    Instant startedAt,
    Instant completedAt
) {
    public static ImportBatchResponse fromEntity(ImportBatch batch) {
        return new ImportBatchResponse(
            batch.getId(),
            batch.getFileName(),
            batch.getFileHash(),
            batch.getStatus(),
            batch.getTotalRows(),
            batch.getSuccessfulRows(),
            batch.getFailedRows(),
            batch.getDuplicateRows(),
            batch.getStartedAt(),
            batch.getCompletedAt()
        );
    }
}
