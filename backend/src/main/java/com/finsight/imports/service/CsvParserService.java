package com.finsight.imports.service;

import com.finsight.imports.dto.CsvColumnMapping;
import com.finsight.transactions.entity.TransactionDirection;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;

@Service
public class CsvParserService {

    private final CsvSanitizer sanitizer;

    private static final List<DateTimeFormatter> DATE_FORMATTERS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,                     // yyyy-MM-dd
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd"),
            DateTimeFormatter.ofPattern("d/M/yyyy"),
            DateTimeFormatter.ofPattern("d-M-yyyy")
    );

    public CsvParserService(CsvSanitizer sanitizer) {
        this.sanitizer = sanitizer;
    }

    public List<CSVRecord> parseRecords(InputStream inputStream) throws Exception {
        Reader reader = new InputStreamReader(inputStream, StandardCharsets.UTF_8);
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .setIgnoreHeaderCase(true)
                .setTrim(true)
                .setIgnoreEmptyLines(true)
                .build();

        try (CSVParser parser = new CSVParser(reader, format)) {
            return parser.getRecords();
        }
    }

    public List<String> extractHeaders(InputStream inputStream) throws Exception {
        Reader reader = new InputStreamReader(inputStream, StandardCharsets.UTF_8);
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(false)
                .setIgnoreHeaderCase(true)
                .setTrim(true)
                .build();

        try (CSVParser parser = new CSVParser(reader, format)) {
            return new ArrayList<>(parser.getHeaderNames());
        }
    }

    public CsvColumnMapping detectMapping(List<String> headers) {
        String dateCol = findBestMatch(headers, List.of("date", "txndate", "txn date", "transaction date", "posted date", "time"));
        String descCol = findBestMatch(headers, List.of("description", "narration", "particulars", "memo", "details", "remark"));
        String merchantCol = findBestMatch(headers, List.of("merchant", "payee", "party", "receiver", "vendor"));
        String debitCol = findBestMatch(headers, List.of("debit", "withdrawal", "dr", "withdraw", "expense", "debit amount"));
        String creditCol = findBestMatch(headers, List.of("credit", "deposit", "cr", "income", "credit amount"));
        String amountCol = null;

        if (debitCol == null && creditCol == null) {
            amountCol = findBestMatch(headers, List.of("amount", "trans amount", "transaction amount", "net", "total"));
        }

        String catCol = findBestMatch(headers, List.of("category", "type", "tag", "expense type"));

        return new CsvColumnMapping(dateCol, descCol, merchantCol, amountCol, debitCol, creditCol, catCol, "AUTO");
    }

    public ParsedRow parseRow(CSVRecord record, CsvColumnMapping mapping) {
        try {
            // 1. Date
            String rawDate = getFieldValue(record, mapping.dateColumn());
            if (rawDate == null || rawDate.isBlank()) {
                return ParsedRow.error("Missing transaction date");
            }
            LocalDate date = parseDate(rawDate.trim());

            // 2. Description
            String rawDesc = getFieldValue(record, mapping.descriptionColumn());
            if (rawDesc == null || rawDesc.isBlank()) {
                rawDesc = "Imported Transaction";
            }
            String description = sanitizer.sanitize(rawDesc);

            // 3. Merchant
            String rawMerchant = getFieldValue(record, mapping.merchantColumn());
            String merchant = rawMerchant != null && !rawMerchant.isBlank() ? sanitizer.sanitize(rawMerchant) : null;

            // 4. Category
            String rawCat = getFieldValue(record, mapping.categoryColumn());
            String category = rawCat != null && !rawCat.isBlank() ? sanitizer.sanitize(rawCat) : null;

            // 5. Amount & Direction
            BigDecimal amount;
            TransactionDirection direction;

            if (mapping.debitColumn() != null || mapping.creditColumn() != null) {
                String rawDebit = getFieldValue(record, mapping.debitColumn());
                String rawCredit = getFieldValue(record, mapping.creditColumn());

                BigDecimal debitVal = parseAmount(rawDebit);
                BigDecimal creditVal = parseAmount(rawCredit);

                if (debitVal != null && debitVal.compareTo(BigDecimal.ZERO) > 0) {
                    amount = debitVal;
                    direction = TransactionDirection.DEBIT;
                } else if (creditVal != null && creditVal.compareTo(BigDecimal.ZERO) > 0) {
                    amount = creditVal;
                    direction = TransactionDirection.CREDIT;
                } else {
                    return ParsedRow.error("Row has no positive debit or credit amount");
                }
            } else {
                String rawAmount = getFieldValue(record, mapping.amountColumn());
                if (rawAmount == null || rawAmount.isBlank()) {
                    return ParsedRow.error("Missing amount value");
                }
                BigDecimal rawNum = parseAmount(rawAmount);
                if (rawNum == null || rawNum.compareTo(BigDecimal.ZERO) == 0) {
                    return ParsedRow.error("Amount cannot be zero");
                }
                if (rawNum.compareTo(BigDecimal.ZERO) < 0) {
                    amount = rawNum.abs();
                    direction = TransactionDirection.DEBIT;
                } else {
                    amount = rawNum;
                    direction = TransactionDirection.CREDIT;
                }
            }

            return ParsedRow.success(date, description, merchant, amount.setScale(4, RoundingMode.HALF_UP), direction, category);

        } catch (Exception e) {
            return ParsedRow.error(e.getMessage());
        }
    }

    public LocalDate parseDate(String raw) {
        for (DateTimeFormatter formatter : DATE_FORMATTERS) {
            try {
                return LocalDate.parse(raw, formatter);
            } catch (DateTimeParseException ignored) {
            }
        }
        throw new IllegalArgumentException("Unsupported date format: " + raw);
    }

    public BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        // Disarm and clean currency symbols, commas, quotes
        String cleaned = raw.replaceAll("[^0-9.\\-+]", "");
        if (cleaned.isBlank() || cleaned.equals("-") || cleaned.equals("+")) {
            return null;
        }
        return new BigDecimal(cleaned);
    }

    private String getFieldValue(CSVRecord record, String colName) {
        if (colName == null || colName.isBlank() || !record.isMapped(colName)) {
            return null;
        }
        return record.get(colName);
    }

    private String findBestMatch(List<String> headers, List<String> keywords) {
        for (String keyword : keywords) {
            for (String header : headers) {
                if (header.equalsIgnoreCase(keyword) || header.toLowerCase().contains(keyword)) {
                    return header;
                }
            }
        }
        return null;
    }

    public record ParsedRow(
            boolean valid,
            LocalDate date,
            String description,
            String merchant,
            BigDecimal amount,
            TransactionDirection direction,
            String categoryName,
            String error
    ) {
        public static ParsedRow success(LocalDate date, String description, String merchant,
                                        BigDecimal amount, TransactionDirection direction, String categoryName) {
            return new ParsedRow(true, date, description, merchant, amount, direction, categoryName, null);
        }

        public static ParsedRow error(String error) {
            return new ParsedRow(false, null, null, null, null, null, null, error);
        }
    }
}
