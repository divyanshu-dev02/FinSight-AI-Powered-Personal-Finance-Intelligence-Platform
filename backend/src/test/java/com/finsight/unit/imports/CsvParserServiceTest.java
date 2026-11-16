package com.finsight.unit.imports;

import com.finsight.imports.dto.CsvColumnMapping;
import com.finsight.imports.service.CsvParserService;
import com.finsight.imports.service.CsvSanitizer;
import com.finsight.transactions.entity.TransactionDirection;
import org.apache.commons.csv.CSVRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CsvParserServiceTest {

    private CsvParserService parserService;

    @BeforeEach
    void setUp() {
        parserService = new CsvParserService(new CsvSanitizer());
    }

    @Test
    @DisplayName("Should detect standard banking headers automatically")
    void shouldDetectHeadersAutomatically() {
        List<String> headers = List.of("Txn Date", "Narration", "Withdrawal Amount", "Deposit Amount", "Party");
        CsvColumnMapping mapping = parserService.detectMapping(headers);

        assertThat(mapping.dateColumn()).isEqualTo("Txn Date");
        assertThat(mapping.descriptionColumn()).isEqualTo("Narration");
        assertThat(mapping.debitColumn()).isEqualTo("Withdrawal Amount");
        assertThat(mapping.creditColumn()).isEqualTo("Deposit Amount");
        assertThat(mapping.merchantColumn()).isEqualTo("Party");
    }

    @Test
    @DisplayName("Should parse multiple date formats correctly")
    void shouldParseMultipleDateFormats() {
        assertThat(parserService.parseDate("2026-11-05")).isEqualTo(LocalDate.of(2026, 11, 5));
        assertThat(parserService.parseDate("05/11/2026")).isEqualTo(LocalDate.of(2026, 11, 5));
        assertThat(parserService.parseDate("11-05-2026")).isEqualTo(LocalDate.of(2026, 5, 11));
    }

    @Test
    @DisplayName("Should parse amounts with currency symbols and commas")
    void shouldParseAmountsCleanly() {
        assertThat(parserService.parseAmount("₹1,250.50")).isEqualByComparingTo(new BigDecimal("1250.50"));
        assertThat(parserService.parseAmount("$45.00")).isEqualByComparingTo(new BigDecimal("45.00"));
        assertThat(parserService.parseAmount("  75000  ")).isEqualByComparingTo(new BigDecimal("75000"));
    }

    @Test
    @DisplayName("Should parse a full CSV record with debit/credit columns")
    void shouldParseRecordSuccessfully() throws Exception {
        String csv = "Date,Description,Debit,Credit\n" +
                     "2026-11-01,Groceries,4500.00,\n" +
                     "2026-11-02,Salary,,75000.00\n";

        List<CSVRecord> records = parserService.parseRecords(new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8)));
        CsvColumnMapping mapping = new CsvColumnMapping("Date", "Description", null, null, "Debit", "Credit", null, "AUTO");

        CsvParserService.ParsedRow row1 = parserService.parseRow(records.get(0), mapping);
        assertThat(row1.valid()).isTrue();
        assertThat(row1.direction()).isEqualTo(TransactionDirection.DEBIT);
        assertThat(row1.amount()).isEqualByComparingTo(new BigDecimal("4500.0000"));

        CsvParserService.ParsedRow row2 = parserService.parseRow(records.get(1), mapping);
        assertThat(row2.valid()).isTrue();
        assertThat(row2.direction()).isEqualTo(TransactionDirection.CREDIT);
        assertThat(row2.amount()).isEqualByComparingTo(new BigDecimal("75000.0000"));
    }
}
