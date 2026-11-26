package com.finsight.imports.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finsight.accounts.service.AccountService;
import com.finsight.categories.repository.CategoryRepository;
import com.finsight.common.exception.BusinessException;
import com.finsight.common.exception.ResourceNotFoundException;
import com.finsight.identity.entity.User;
import com.finsight.imports.dto.ConfirmImportRequest;
import com.finsight.imports.dto.ConfirmImportRequest.RowReview;
import com.finsight.imports.dto.CsvColumnMapping;
import com.finsight.imports.dto.CsvPreviewResponse;
import com.finsight.imports.dto.CsvPreviewRow;
import com.finsight.imports.dto.ImportBatchResponse;
import com.finsight.imports.entity.ImportBatch;
import com.finsight.imports.entity.ImportBatchStatus;
import com.finsight.imports.repository.ImportBatchRepository;
import com.finsight.imports.service.CsvParserService.ParsedRow;
import com.finsight.transactions.entity.Transaction;
import com.finsight.transactions.entity.TransactionDirection;
import com.finsight.transactions.repository.TransactionRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@Service
public class ImportService {

    private static final int PAGE_SIZE = 25;
    private static final int MAX_ROWS = 10_000;
    private static final Duration PREVIEW_TTL = Duration.ofMinutes(20);

    private final CsvParserService parserService;
    private final StatementParserFactory parserFactory;
    private final ImportBatchRepository importBatchRepository;
    private final TransactionRepository transactionRepository;
    private final AccountService accountService;
    private final CategoryRepository categoryRepository;
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final Map<UUID, Preview> previews = new LinkedHashMap<>();

    public ImportService(CsvParserService parserService, StatementParserFactory parserFactory,
                         ImportBatchRepository importBatchRepository, TransactionRepository transactionRepository,
                         AccountService accountService, CategoryRepository categoryRepository, JdbcClient jdbc, ObjectMapper json) {
        this.parserService = parserService;
        this.parserFactory = parserFactory;
        this.importBatchRepository = importBatchRepository;
        this.transactionRepository = transactionRepository;
        this.accountService = accountService;
        this.categoryRepository = categoryRepository;
        this.jdbc = jdbc;
        this.json = json;
    }

    public CsvPreviewResponse generatePreview(MultipartFile file, UUID accountId, User user, String password) {
        if (file.isEmpty()) {
            throw new BusinessException("EMPTY_FILE", "Uploaded statement file is empty");
        }
        accountService.findAccountOrThrow(accountId, user);

        try {
            byte[] bytes = file.getBytes();
            String name = Objects.requireNonNullElse(file.getOriginalFilename(), "statement");
            String fileHash = computeSha256(bytes);
            var format = parserFactory.detectFormat(file);
            boolean csv = format == StatementParserFactory.FileFormat.CSV;
            List<String> headers = csv ? parserService.extractHeaders(new ByteArrayInputStream(bytes))
                    : List.of("Date", "Description", "Amount", "Direction");
            if (headers.isEmpty()) {
                throw new BusinessException("INVALID_CSV", "No headers found in CSV file");
            }
            CsvColumnMapping mapping = csv ? parserService.detectMapping(headers)
                    : new CsvColumnMapping("Date", "Description", "Merchant", "Amount", null, null, "Category", "AUTO");
            List<ParsedRow> rows = csv ? parseCsv(bytes, mapping)
                    : parserFactory.getParser(format).parse(new ByteArrayInputStream(bytes), password);
            checkRowLimit(rows);
            UUID token = UUID.randomUUID();
            List<CsvPreviewRow> reviewRows = describe(rows, user, accountId);
            int errors = (int) reviewRows.stream().filter(row -> row.validationError() != null).count();
            int duplicates = (int) reviewRows.stream().filter(CsvPreviewRow::duplicate).count();
            var preview = new Preview(user.getId(), accountId, name.substring(0, Math.min(name.length(), 255)),
                    fileHash, format, csv ? bytes : null, rows, mapping, reviewRows, Instant.now());
            remember(token, preview);

            return new CsvPreviewResponse(token.toString(), preview.fileName(), fileHash, headers,
                    mapping, page(reviewRows, 0), rows.size(), rows.size() - errors - duplicates, duplicates, errors);
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new BusinessException("STATEMENT_PARSE_FAILED", "Failed to parse statement: " + exception.getMessage());
        }
    }

    public List<CsvPreviewRow> getPreviewRows(UUID token, User user, int pageNumber) {
        return page(previewFor(token, user).reviewRows(), pageNumber);
    }

    @Transactional
    public ImportBatchResponse confirmImport(ConfirmImportRequest request, User user) {
        // One import at a time per user, including distinct previews of overlapping statements.
        jdbc.sql("SELECT id FROM users WHERE id = :id FOR NO KEY UPDATE").param("id", user.getId())
                .query(UUID.class).single();

        var completed = importBatchRepository.findByIdAndUser(request.fileToken(), user);
        if (completed.isPresent() && request.accountId().equals(completed.get().getAccountId())) {
            return ImportBatchResponse.fromEntity(completed.get());
        }

        Preview preview = previewFor(request.fileToken(), user);
        if (!preview.accountId().equals(request.accountId())) {
            throw new BusinessException("ACCOUNT_MISMATCH", "Upload the statement again to change the target account.");
        }
        var account = accountService.findAccountOrThrow(request.accountId(), user);
        boolean remapped = preview.csvBytes() != null && request.mapping() != null
                && !request.mapping().equals(preview.mapping());
        List<ParsedRow> rows = preview.rows();
        if (remapped) {
            if (request.reviews() != null && !request.reviews().isEmpty()) {
                throw new BusinessException("INVALID_REVIEW", "Review the statement again after changing its column mapping.");
            }
            try {
                rows = parseCsv(preview.csvBytes(), request.mapping());
            } catch (Exception exception) {
                throw new BusinessException("STATEMENT_PARSE_FAILED", "The statement could not be read with this mapping.");
            }
        }
        checkRowLimit(rows);
        Map<Integer, RowReview> reviews = new HashMap<>();
        for (RowReview review : Objects.requireNonNullElse(request.reviews(), List.<RowReview>of())) {
            if (review.rowNumber() > rows.size() || reviews.putIfAbsent(review.rowNumber(), review) != null) {
                throw new BusinessException("INVALID_REVIEW", "Review selections must refer to distinct statement rows.");
            }
        }

        var batch = new ImportBatch(user, preview.fileName(), preview.fileHash());
        batch.setId(request.fileToken());
        batch.setAccountId(account.getId());
        batch.setStatus(ImportBatchStatus.PROCESSING);
        batch = importBatchRepository.save(batch);

        var categories = new StatementCategoryReview(jdbc, categoryRepository, user);
        var seen = new HashSet<>(existingRows(user, account.getId(), rows).keySet());
        var source = parserFactory.toTransactionSource(preview.format());
        List<Transaction> imported = new ArrayList<>();
        int skipped = 0;
        int rejected = 0;
        List<RowIssue> issues = new ArrayList<>();
        for (int index = 0; index < rows.size(); index++) {
            ParsedRow row = rows.get(index);
            String error = validationError(row);
            if (error != null) {
                rejected++;
                if (issues.size() < PAGE_SIZE) {
                    issues.add(new RowIssue(index + 1, error));
                }
                continue;
            }
            Match key = match(row);
            if (!seen.add(key) && request.skipDuplicates()) {
                skipped++;
                continue;
            }
            var category = categories.resolve(row, reviews.get(index + 1));
            var transaction = new Transaction(user, account, category, key.amount(), account.getCurrency(),
                    row.direction(), row.description(), row.merchant(), row.date(), source);
            transaction.setImportBatchId(batch.getId());
            transaction.setExternalFingerprint(computeFingerprint(user.getId(), account.getId(),
                    row.date(), key.amount(), row.direction(), row.description()));
            imported.add(transaction);
        }

        transactionRepository.saveAll(imported);
        batch.setTotalRows(rows.size());
        batch.setSuccessfulRows(imported.size());
        batch.setDuplicateRows(skipped);
        batch.setFailedRows(rejected);
        if (!issues.isEmpty()) {
            try {
                batch.setErrorSummary(json.writeValueAsString(issues));
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("Could not store statement review details", exception);
            }
        }
        batch.setStatus(ImportBatchStatus.COMPLETED);
        batch.setCompletedAt(Instant.now());
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                forget(request.fileToken());
            }
        });
        return ImportBatchResponse.fromEntity(batch);
    }

    public List<ImportBatchResponse> getImportBatchesForUser(User user) {
        return importBatchRepository.findByUserOrderByCreatedAtDesc(user).stream().map(ImportBatchResponse::fromEntity).toList();
    }

    public ImportBatchResponse getImportBatchById(UUID batchId, User user) {
        return importBatchRepository.findByIdAndUser(batchId, user).map(ImportBatchResponse::fromEntity)
                .orElseThrow(() -> new ResourceNotFoundException("ImportBatch", "id", batchId));
    }

    private List<CsvPreviewRow> describe(List<ParsedRow> rows, User user, UUID accountId) {
        var existing = existingRows(user, accountId, rows);
        Set<Match> seen = new HashSet<>();
        var categories = new StatementCategoryReview(jdbc, categoryRepository, user);
        List<CsvPreviewRow> result = new ArrayList<>();
        for (int index = 0; index < rows.size(); index++) {
            ParsedRow row = rows.get(index);
            String error = validationError(row);
            UUID existingId = null;
            String reason = null;
            StatementCategoryReview.Suggestion suggestion = null;
            if (error == null) {
                Match key = match(row);
                existingId = existing.get(key);
                boolean first = seen.add(key);
                reason = existingId != null ? "EXISTING" : first ? null : "IN_FILE";
                suggestion = categories.suggest(row);
            }
            var category = suggestion == null ? null : suggestion.category();
            result.add(new CsvPreviewRow(index + 1, row.date(), row.description(), row.merchant(), row.amount(),
                    row.direction(), row.categoryName(), reason != null, error,
                    StatementCategoryReview.normalizedMerchant(row.merchant()), reason, existingId,
                    category == null ? null : category.getId(), category == null ? null : category.getName(),
                    suggestion != null && suggestion.savedRule()));
        }
        return result;
    }

    private Map<Match, UUID> existingRows(User user, UUID accountId, List<ParsedRow> rows) {
        var dates = rows.stream().filter(ParsedRow::valid).map(ParsedRow::date).sorted().toList();
        Map<Match, UUID> matches = new HashMap<>();
        if (dates.isEmpty()) {
            return matches;
        }
        jdbc.sql("""
                SELECT id, transaction_date, amount, direction, description FROM transactions
                WHERE user_id = :userId AND account_id = :accountId
                  AND transaction_date BETWEEN :start AND :end
                ORDER BY id
                """)
                .param("userId", user.getId()).param("accountId", accountId)
                .param("start", dates.getFirst()).param("end", dates.getLast())
                .query((rs, index) -> Map.entry(new Match(rs.getObject("transaction_date", LocalDate.class),
                        rs.getBigDecimal("amount"), TransactionDirection.valueOf(rs.getString("direction")),
                        normalizedDescription(rs.getString("description"))), rs.getObject("id", UUID.class)))
                .list().forEach(entry -> matches.putIfAbsent(entry.getKey(), entry.getValue()));
        return matches;
    }

    private List<ParsedRow> parseCsv(byte[] bytes, CsvColumnMapping mapping) throws Exception {
        return parserService.parseRecords(new ByteArrayInputStream(bytes)).stream()
                .map(record -> parserService.parseRow(record, mapping)).toList();
    }

    private static String validationError(ParsedRow row) {
        if (!row.valid()) {
            return row.error();
        }
        BigDecimal amount = row.amount().setScale(4, RoundingMode.HALF_UP);
        if (amount.signum() <= 0 || amount.precision() > 19) {
            return "Amount is outside the supported range.";
        }
        if (row.description() == null || row.description().length() > 255
                || (row.merchant() != null && row.merchant().length() > 100)
                || (row.categoryName() != null && row.categoryName().strip().length() > 100)) {
            return "Description, merchant, or category exceeds its supported length.";
        }
        return null;
    }

    private static Match match(ParsedRow row) {
        return new Match(row.date(), row.amount().setScale(4, RoundingMode.HALF_UP), row.direction(),
                normalizedDescription(row.description()));
    }

    private static String normalizedDescription(String description) {
        return description == null ? "" : description.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private static void checkRowLimit(List<ParsedRow> rows) {
        if (rows.size() > MAX_ROWS) {
            throw new BusinessException("TOO_MANY_ROWS", "Split the statement into files with 10,000 rows or fewer.");
        }
    }

    private static List<CsvPreviewRow> page(List<CsvPreviewRow> rows, int number) {
        if (number < 0 || number > MAX_ROWS / PAGE_SIZE) {
            throw new BusinessException("INVALID_PAGE", "Invalid statement review page.");
        }
        int start = Math.min(rows.size(), number * PAGE_SIZE);
        return rows.subList(start, Math.min(rows.size(), start + PAGE_SIZE));
    }

    private synchronized void remember(UUID token, Preview preview) {
        previews.values().removeIf(this::expired);
        if (previews.size() >= 16) {
            previews.remove(previews.keySet().iterator().next());
        }
        previews.put(token, preview);
    }

    private synchronized void forget(UUID token) {
        previews.remove(token);
    }

    private synchronized Preview previewFor(UUID token, User user) {
        previews.values().removeIf(this::expired);
        Preview preview = previews.get(token);
        if (preview == null || !preview.userId().equals(user.getId())) {
            throw new BusinessException("TOKEN_EXPIRED", "The import preview is unavailable. Please re-upload your file.");
        }
        return preview;
    }

    private boolean expired(Preview preview) {
        return preview.cachedAt().plus(PREVIEW_TTL).isBefore(Instant.now());
    }

    public String computeFingerprint(UUID userId, UUID accountId, LocalDate date,
                                     BigDecimal amount, TransactionDirection direction, String desc) {
        String raw = userId + ":" + accountId + ":" + date + ":" + amount.stripTrailingZeros().toPlainString()
                + ":" + direction + ":" + normalizedDescription(desc);
        return computeSha256(raw.getBytes(StandardCharsets.UTF_8));
    }

    public String computeSha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 not available", exception);
        }
    }

    private record RowIssue(int rowNumber, String message) {}
    private record Match(LocalDate date, BigDecimal amount, TransactionDirection direction, String description) {}
    private record Preview(UUID userId, UUID accountId, String fileName, String fileHash,
                           StatementParserFactory.FileFormat format, byte[] csvBytes, List<ParsedRow> rows,
                           CsvColumnMapping mapping, List<CsvPreviewRow> reviewRows, Instant cachedAt) {}
}
