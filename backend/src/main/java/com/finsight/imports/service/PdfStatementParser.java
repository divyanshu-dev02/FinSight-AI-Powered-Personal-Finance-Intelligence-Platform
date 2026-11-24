package com.finsight.imports.service;

import com.finsight.transactions.entity.TransactionDirection;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses bank statement PDFs by extracting text and finding transaction-like rows.
 * Supports password-protected PDFs (Indian banks commonly use PAN+DOB as password).
 *
 * Strategy: Extract all text → split into lines → try to find lines starting with
 * a date pattern and containing monetary amounts → parse those as transactions.
 */
@Component
public class PdfStatementParser implements StatementParser {

    private final CsvSanitizer sanitizer;

    // Date patterns commonly found in Indian bank statements
    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("dd/MM/yy"),
            DateTimeFormatter.ofPattern("dd-MM-yy"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("dd MMM yyyy"),
            DateTimeFormatter.ofPattern("dd-MMM-yyyy"),
            DateTimeFormatter.ofPattern("d/M/yyyy"),
            DateTimeFormatter.ofPattern("d-M-yyyy"),
            DateTimeFormatter.ISO_LOCAL_DATE
    );

    // Regex to find a date at the start of a line
    private static final Pattern DATE_LINE_PATTERN = Pattern.compile(
            "^\\s*(\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4}|\\d{4}[/\\-]\\d{1,2}[/\\-]\\d{1,2}|\\d{1,2}[\\s\\-]\\w{3}[\\s\\-]\\d{2,4})\\s+"
    );

    // Regex to find monetary amounts (Indian format: 1,23,456.78 or standard: 123,456.78)
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
            "([\\d,]+\\.\\d{1,2})"
    );

    public PdfStatementParser(CsvSanitizer sanitizer) {
        this.sanitizer = sanitizer;
    }

    @Override
    public List<CsvParserService.ParsedRow> parse(InputStream inputStream, String password) throws Exception {
        byte[] pdfBytes = inputStream.readAllBytes();

        PDDocument document;
        if (password != null && !password.isBlank()) {
            document = Loader.loadPDF(pdfBytes, password);
        } else {
            document = Loader.loadPDF(pdfBytes);
        }

        List<CsvParserService.ParsedRow> results = new ArrayList<>();
        try {
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(document);
            String[] lines = text.split("\\r?\\n");

            for (String line : lines) {
                CsvParserService.ParsedRow row = tryParseLine(line.trim());
                if (row != null) {
                    results.add(row);
                }
            }
        } finally {
            document.close();
        }

        return results;
    }

    @Override
    public String formatName() {
        return "PDF";
    }

    private CsvParserService.ParsedRow tryParseLine(String line) {
        if (line.isBlank()) return null;

        Matcher dateMatcher = DATE_LINE_PATTERN.matcher(line);
        if (!dateMatcher.find()) return null;

        String rawDate = dateMatcher.group(1).trim();
        LocalDate date = tryParseDate(rawDate);
        if (date == null) return null;

        // Everything after the date is the rest of the line
        String rest = line.substring(dateMatcher.end()).trim();
        if (rest.isBlank()) return null;

        // Find all monetary amounts in the line
        Matcher amountMatcher = AMOUNT_PATTERN.matcher(rest);
        List<BigDecimal> amounts = new ArrayList<>();
        List<Integer> amountPositions = new ArrayList<>();
        while (amountMatcher.find()) {
            String raw = amountMatcher.group(1).replace(",", "");
            try {
                BigDecimal val = new BigDecimal(raw);
                if (val.compareTo(BigDecimal.ZERO) > 0) {
                    amounts.add(val);
                    amountPositions.add(amountMatcher.start());
                }
            } catch (NumberFormatException ignored) {}
        }

        if (amounts.isEmpty()) return null;

        // Extract the description: text between the date and the first amount
        String description = "Imported Transaction";
        if (!amountPositions.isEmpty() && amountPositions.get(0) > 0) {
            description = rest.substring(0, amountPositions.get(0)).trim();
            // Clean up multiple spaces
            description = description.replaceAll("\\s{2,}", " ");
        }
        if (description.isBlank()) {
            description = "Imported Transaction";
        }
        description = sanitizer.sanitize(description);

        // Determine debit/credit:
        // Most Indian bank statements have: Date | Description | Debit | Credit | Balance
        // If we have 2+ amounts, the second-to-last might be debit/credit, last is balance
        BigDecimal amount;
        TransactionDirection direction;

        if (amounts.size() >= 3) {
            // Likely: Debit | Credit | Balance — pick whichever of first two is non-trivial
            BigDecimal debit = amounts.get(amounts.size() - 3);
            BigDecimal credit = amounts.get(amounts.size() - 2);
            if (debit.compareTo(credit) > 0) {
                amount = debit;
                direction = TransactionDirection.DEBIT;
            } else {
                amount = credit;
                direction = TransactionDirection.CREDIT;
            }
        } else if (amounts.size() == 2) {
            // Could be Amount | Balance, or Debit/Credit pair
            amount = amounts.get(0);
            // Heuristic: if second amount is larger, first was likely a debit
            direction = amounts.get(1).compareTo(amounts.get(0)) < 0
                    ? TransactionDirection.DEBIT
                    : TransactionDirection.CREDIT;
        } else {
            // Single amount — check if line contains debit/credit hints
            amount = amounts.get(0);
            String lower = line.toLowerCase();
            if (lower.contains("cr") || lower.contains("credit") || lower.contains("deposit")) {
                direction = TransactionDirection.CREDIT;
            } else {
                direction = TransactionDirection.DEBIT;
            }
        }

        return CsvParserService.ParsedRow.success(
                date,
                description,
                null,
                amount.setScale(4, RoundingMode.HALF_UP),
                direction,
                null
        );
    }

    private LocalDate tryParseDate(String raw) {
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                LocalDate d = LocalDate.parse(raw, fmt);
                // Sanity: year should be between 2000 and 2100
                if (d.getYear() >= 2000 && d.getYear() <= 2100) {
                    return d;
                }
                // Handle 2-digit years
                if (d.getYear() < 100) {
                    return d.plusYears(2000);
                }
            } catch (DateTimeParseException ignored) {}
        }
        return null;
    }
}
