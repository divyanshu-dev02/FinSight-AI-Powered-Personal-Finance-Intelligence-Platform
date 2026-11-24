package com.finsight.imports.service;

import com.finsight.imports.dto.CsvColumnMapping;
import com.finsight.transactions.entity.TransactionDirection;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Parses Excel (.xlsx / .xls) bank statements using Apache POI.
 * Auto-detects headers and column mappings, similar to CsvParserService.
 */
@Component
public class ExcelStatementParser implements StatementParser {

    private final CsvSanitizer sanitizer;

    private static final List<DateTimeFormatter> DATE_FORMATTERS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd"),
            DateTimeFormatter.ofPattern("d/M/yyyy"),
            DateTimeFormatter.ofPattern("d-M-yyyy")
    );

    public ExcelStatementParser(CsvSanitizer sanitizer) {
        this.sanitizer = sanitizer;
    }

    @Override
    public List<CsvParserService.ParsedRow> parse(InputStream inputStream, String password) throws Exception {
        Workbook workbook;
        if (password != null && !password.isBlank()) {
            workbook = WorkbookFactory.create(inputStream, password);
        } else {
            workbook = WorkbookFactory.create(inputStream);
        }

        try {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null || sheet.getPhysicalNumberOfRows() == 0) {
                return Collections.emptyList();
            }

            // Find header row (first row with 3+ non-empty text cells)
            int headerRowIdx = findHeaderRow(sheet);
            if (headerRowIdx < 0) {
                return Collections.emptyList();
            }

            Row headerRow = sheet.getRow(headerRowIdx);
            List<String> headers = extractHeaders(headerRow);
            CsvColumnMapping mapping = detectMapping(headers);

            List<CsvParserService.ParsedRow> results = new ArrayList<>();
            for (int i = headerRowIdx + 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null || isRowEmpty(row)) continue;

                CsvParserService.ParsedRow parsed = parseRow(row, headers, mapping);
                if (parsed != null) {
                    results.add(parsed);
                }
            }

            return results;
        } finally {
            workbook.close();
        }
    }

    @Override
    public String formatName() {
        return "Excel";
    }

    private int findHeaderRow(Sheet sheet) {
        for (int i = 0; i <= Math.min(sheet.getLastRowNum(), 10); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            int textCellCount = 0;
            for (int j = 0; j < row.getLastCellNum(); j++) {
                Cell cell = row.getCell(j);
                if (cell != null && cell.getCellType() == CellType.STRING
                        && !cell.getStringCellValue().isBlank()) {
                    textCellCount++;
                }
            }
            if (textCellCount >= 3) return i;
        }
        return -1;
    }

    private List<String> extractHeaders(Row headerRow) {
        List<String> headers = new ArrayList<>();
        for (int i = 0; i < headerRow.getLastCellNum(); i++) {
            Cell cell = headerRow.getCell(i);
            if (cell != null && cell.getCellType() == CellType.STRING) {
                headers.add(cell.getStringCellValue().trim());
            } else {
                headers.add("Column_" + (i + 1));
            }
        }
        return headers;
    }

    private CsvColumnMapping detectMapping(List<String> headers) {
        String dateCol = findBestMatch(headers, List.of("date", "txndate", "txn date", "transaction date", "posted date", "value date"));
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

    private CsvParserService.ParsedRow parseRow(Row row, List<String> headers, CsvColumnMapping mapping) {
        try {
            // 1. Date
            LocalDate date = getCellDate(row, headers, mapping.dateColumn());
            if (date == null) return CsvParserService.ParsedRow.error("Missing or invalid date");

            // 2. Description
            String desc = getCellString(row, headers, mapping.descriptionColumn());
            if (desc == null || desc.isBlank()) desc = "Imported Transaction";
            desc = sanitizer.sanitize(desc);

            // 3. Merchant
            String merchant = getCellString(row, headers, mapping.merchantColumn());
            if (merchant != null && !merchant.isBlank()) merchant = sanitizer.sanitize(merchant);
            else merchant = null;

            // 4. Category
            String category = getCellString(row, headers, mapping.categoryColumn());
            if (category != null && !category.isBlank()) category = sanitizer.sanitize(category);
            else category = null;

            // 5. Amount & Direction
            BigDecimal amount;
            TransactionDirection direction;

            if (mapping.debitColumn() != null || mapping.creditColumn() != null) {
                BigDecimal debitVal = getCellNumeric(row, headers, mapping.debitColumn());
                BigDecimal creditVal = getCellNumeric(row, headers, mapping.creditColumn());

                if (debitVal != null && debitVal.compareTo(BigDecimal.ZERO) > 0) {
                    amount = debitVal;
                    direction = TransactionDirection.DEBIT;
                } else if (creditVal != null && creditVal.compareTo(BigDecimal.ZERO) > 0) {
                    amount = creditVal;
                    direction = TransactionDirection.CREDIT;
                } else {
                    return CsvParserService.ParsedRow.error("No positive debit or credit amount");
                }
            } else {
                BigDecimal rawAmount = getCellNumeric(row, headers, mapping.amountColumn());
                if (rawAmount == null || rawAmount.compareTo(BigDecimal.ZERO) == 0) {
                    return CsvParserService.ParsedRow.error("Missing or zero amount");
                }
                if (rawAmount.compareTo(BigDecimal.ZERO) < 0) {
                    amount = rawAmount.abs();
                    direction = TransactionDirection.DEBIT;
                } else {
                    amount = rawAmount;
                    direction = TransactionDirection.CREDIT;
                }
            }

            return CsvParserService.ParsedRow.success(
                    date, desc, merchant,
                    amount.setScale(4, RoundingMode.HALF_UP),
                    direction, category
            );
        } catch (Exception e) {
            return CsvParserService.ParsedRow.error(e.getMessage());
        }
    }

    private int getColumnIndex(List<String> headers, String colName) {
        if (colName == null) return -1;
        for (int i = 0; i < headers.size(); i++) {
            if (headers.get(i).equalsIgnoreCase(colName)) return i;
        }
        return -1;
    }

    private String getCellString(Row row, List<String> headers, String colName) {
        int idx = getColumnIndex(headers, colName);
        if (idx < 0) return null;
        Cell cell = row.getCell(idx);
        if (cell == null) return null;
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                    ? cell.getLocalDateTimeCellValue().toLocalDate().toString()
                    : BigDecimal.valueOf(cell.getNumericCellValue()).toPlainString();
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            default -> null;
        };
    }

    private BigDecimal getCellNumeric(Row row, List<String> headers, String colName) {
        int idx = getColumnIndex(headers, colName);
        if (idx < 0) return null;
        Cell cell = row.getCell(idx);
        if (cell == null) return null;
        return switch (cell.getCellType()) {
            case NUMERIC -> BigDecimal.valueOf(cell.getNumericCellValue());
            case STRING -> {
                String val = cell.getStringCellValue().replaceAll("[^0-9.\\-+]", "");
                if (val.isBlank() || val.equals("-") || val.equals("+")) yield null;
                yield new BigDecimal(val);
            }
            default -> null;
        };
    }

    private LocalDate getCellDate(Row row, List<String> headers, String colName) {
        int idx = getColumnIndex(headers, colName);
        if (idx < 0) return null;
        Cell cell = row.getCell(idx);
        if (cell == null) return null;

        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return cell.getDateCellValue().toInstant()
                    .atZone(ZoneId.systemDefault())
                    .toLocalDate();
        }

        // Try parsing as string
        String raw = getCellString(row, headers, colName);
        if (raw == null || raw.isBlank()) return null;
        for (DateTimeFormatter fmt : DATE_FORMATTERS) {
            try { return LocalDate.parse(raw.trim(), fmt); }
            catch (DateTimeParseException ignored) {}
        }
        return null;
    }

    private boolean isRowEmpty(Row row) {
        for (int i = 0; i < row.getLastCellNum(); i++) {
            Cell cell = row.getCell(i);
            if (cell != null && cell.getCellType() != CellType.BLANK) {
                if (cell.getCellType() == CellType.STRING && cell.getStringCellValue().isBlank()) continue;
                return false;
            }
        }
        return true;
    }

    private String findBestMatch(List<String> headers, List<String> keywords) {
        // Pass 1: exact match
        for (String keyword : keywords) {
            for (String header : headers) {
                if (header.equalsIgnoreCase(keyword)) {
                    return header;
                }
            }
        }
        // Pass 2: substring match (skip short abbreviations like "cr" or "dr" to avoid false positives like "description")
        for (String keyword : keywords) {
            if (keyword.length() <= 2) continue;
            for (String header : headers) {
                if (header.toLowerCase().contains(keyword.toLowerCase())) {
                    return header;
                }
            }
        }
        return null;
    }
}
