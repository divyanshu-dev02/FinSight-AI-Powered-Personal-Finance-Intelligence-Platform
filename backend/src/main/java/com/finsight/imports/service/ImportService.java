package com.finsight.imports.service;

import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.accounts.service.AccountService;
import com.finsight.categories.entity.Category;
import com.finsight.categories.entity.CategoryType;
import com.finsight.categories.repository.CategoryRepository;
import com.finsight.common.exception.BusinessException;
import com.finsight.common.exception.ResourceNotFoundException;
import com.finsight.identity.entity.User;
import com.finsight.imports.dto.*;
import com.finsight.imports.entity.ImportBatch;
import com.finsight.imports.entity.ImportBatchStatus;
import com.finsight.imports.repository.ImportBatchRepository;
import com.finsight.transactions.entity.Transaction;
import com.finsight.transactions.entity.TransactionDirection;
import com.finsight.transactions.entity.TransactionSource;
import com.finsight.transactions.repository.TransactionRepository;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ImportService {

    private final CsvParserService parserService;
    private final ImportBatchRepository importBatchRepository;
    private final TransactionRepository transactionRepository;
    private final AccountService accountService;
    private final CategoryRepository categoryRepository;

    // Ephemeral in-memory file cache for preview -> confirm flow
    private final Map<String, CachedFile> fileCache = new ConcurrentHashMap<>();

    public ImportService(CsvParserService parserService,
                         ImportBatchRepository importBatchRepository,
                         TransactionRepository transactionRepository,
                         AccountService accountService,
                         CategoryRepository categoryRepository) {
        this.parserService = parserService;
        this.importBatchRepository = importBatchRepository;
        this.transactionRepository = transactionRepository;
        this.accountService = accountService;
        this.categoryRepository = categoryRepository;
    }

    public CsvPreviewResponse generatePreview(MultipartFile file, UUID accountId, User user) {
        if (file.isEmpty()) {
            throw new BusinessException("EMPTY_FILE", "Uploaded CSV file is empty");
        }

        try {
            byte[] bytes = file.getBytes();
            String fileHash = computeSha256(bytes);
            String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "statement.csv";

            // Verify account ownership
            accountService.findAccountOrThrow(accountId, user);

            // Extract headers & detect mapping
            List<String> headers = parserService.extractHeaders(new ByteArrayInputStream(bytes));
            if (headers.isEmpty()) {
                throw new BusinessException("INVALID_CSV", "No headers found in CSV file");
            }

            CsvColumnMapping mapping = parserService.detectMapping(headers);

            // Parse rows
            List<CSVRecord> records = parserService.parseRecords(new ByteArrayInputStream(bytes));
            List<CsvPreviewRow> previewRows = new ArrayList<>();

            int validCount = 0;
            int duplicateCount = 0;
            int errorCount = 0;

            for (int i = 0; i < records.size(); i++) {
                CSVRecord record = records.get(i);
                CsvParserService.ParsedRow parsed = parserService.parseRow(record, mapping);

                if (!parsed.valid()) {
                    errorCount++;
                    if (previewRows.size() < 20) {
                        previewRows.add(new CsvPreviewRow(
                                i + 1, null, null, null, null, null, null, false, parsed.error()
                        ));
                    }
                    continue;
                }

                String fingerprint = computeFingerprint(
                        user.getId(), accountId, parsed.date(), parsed.amount(), parsed.direction(), parsed.description()
                );
                boolean isDuplicate = transactionRepository.existsByExternalFingerprintAndUser(fingerprint, user);

                if (isDuplicate) {
                    duplicateCount++;
                } else {
                    validCount++;
                }

                if (previewRows.size() < 20) {
                    previewRows.add(new CsvPreviewRow(
                            i + 1,
                            parsed.date(),
                            parsed.description(),
                            parsed.merchant(),
                            parsed.amount(),
                            parsed.direction(),
                            parsed.categoryName(),
                            isDuplicate,
                            null
                    ));
                }
            }

            String fileToken = UUID.randomUUID().toString();
            fileCache.put(fileToken, new CachedFile(originalName, fileHash, bytes, Instant.now()));

            return new CsvPreviewResponse(
                    fileToken,
                    originalName,
                    fileHash,
                    headers,
                    mapping,
                    previewRows,
                    records.size(),
                    validCount,
                    duplicateCount,
                    errorCount
            );

        } catch (BusinessException be) {
            throw be;
        } catch (Exception e) {
            throw new BusinessException("CSV_PARSE_FAILED", "Failed to parse CSV file: " + e.getMessage());
        }
    }

    @Transactional
    public ImportBatchResponse confirmImport(ConfirmImportRequest request, User user) {
        CachedFile cached = fileCache.get(request.fileToken());
        if (cached == null) {
            throw new BusinessException("TOKEN_EXPIRED", "The import preview session has expired. Please re-upload your file.");
        }

        FinancialAccount account = accountService.findAccountOrThrow(request.accountId(), user);

        ImportBatch batch = new ImportBatch(user, cached.fileName(), cached.fileHash());
        batch.setStatus(ImportBatchStatus.PROCESSING);
        batch = importBatchRepository.save(batch);

        try {
            List<CSVRecord> records = parserService.parseRecords(new ByteArrayInputStream(cached.bytes()));
            batch.setTotalRows(records.size());

            CsvColumnMapping mapping = request.mapping();
            if (mapping == null) {
                List<String> headers = parserService.extractHeaders(new ByteArrayInputStream(cached.bytes()));
                mapping = parserService.detectMapping(headers);
            }

            List<Transaction> toSave = new ArrayList<>();
            int successCount = 0;
            int duplicateCount = 0;
            int failedCount = 0;

            for (CSVRecord record : records) {
                CsvParserService.ParsedRow parsed = parserService.parseRow(record, mapping);
                if (!parsed.valid()) {
                    failedCount++;
                    continue;
                }

                String fingerprint = computeFingerprint(
                        user.getId(), account.getId(), parsed.date(), parsed.amount(), parsed.direction(), parsed.description()
                );

                boolean isDuplicate = transactionRepository.existsByExternalFingerprintAndUser(fingerprint, user);
                if (isDuplicate) {
                    duplicateCount++;
                    if (request.skipDuplicates()) {
                        continue;
                    }
                }

                // Match Category if specified
                Category category = null;
                if (parsed.categoryName() != null && !parsed.categoryName().isBlank()) {
                    category = findOrCreateCategory(parsed.categoryName(), parsed.direction(), user);
                }

                Transaction tx = new Transaction(
                        user,
                        account,
                        category,
                        parsed.amount(),
                        account.getCurrency(),
                        parsed.direction(),
                        parsed.description(),
                        parsed.merchant(),
                        parsed.date(),
                        TransactionSource.CSV
                );
                tx.setImportBatchId(batch.getId());
                tx.setExternalFingerprint(fingerprint);

                toSave.add(tx);
                successCount++;
            }

            transactionRepository.saveAll(toSave);

            batch.setSuccessfulRows(successCount);
            batch.setDuplicateRows(duplicateCount);
            batch.setFailedRows(failedCount);
            batch.setStatus(ImportBatchStatus.COMPLETED);
            batch.setCompletedAt(Instant.now());

            importBatchRepository.save(batch);

            // Clean up cache
            fileCache.remove(request.fileToken());

            return ImportBatchResponse.fromEntity(batch);

        } catch (Exception e) {
            batch.setStatus(ImportBatchStatus.FAILED);
            batch.setCompletedAt(Instant.now());
            importBatchRepository.save(batch);
            throw new BusinessException("IMPORT_EXECUTION_FAILED", "Failed during batch transaction creation: " + e.getMessage());
        }
    }

    public List<ImportBatchResponse> getImportBatchesForUser(User user) {
        return importBatchRepository.findByUserOrderByCreatedAtDesc(user).stream()
                .map(ImportBatchResponse::fromEntity)
                .toList();
    }

    public ImportBatchResponse getImportBatchById(UUID batchId, User user) {
        ImportBatch batch = importBatchRepository.findByIdAndUser(batchId, user)
                .orElseThrow(() -> new ResourceNotFoundException("ImportBatch", "id", batchId));
        return ImportBatchResponse.fromEntity(batch);
    }

    private Category findOrCreateCategory(String name, TransactionDirection direction, User user) {
        CategoryType catType = direction == TransactionDirection.CREDIT ? CategoryType.INCOME : CategoryType.EXPENSE;
        return categoryRepository.findAllAvailableForUser(user).stream()
                .filter(c -> c.getName().equalsIgnoreCase(name.trim()))
                .findFirst()
                .orElseGet(() -> categoryRepository.save(new Category(
                        user, name.trim(), catType, "tag", "#64748B", null
                )));
    }

    public String computeFingerprint(UUID userId, UUID accountId, LocalDate date,
                                     BigDecimal amount, TransactionDirection direction, String desc) {
        String raw = userId + ":" + accountId + ":" + date + ":" + amount.toPlainString() + ":" + direction + ":" + (desc != null ? desc.trim().toLowerCase() : "");
        return computeSha256(raw.getBytes(StandardCharsets.UTF_8));
    }

    public String computeSha256(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private record CachedFile(String fileName, String fileHash, byte[] bytes, Instant cachedAt) {}
}
