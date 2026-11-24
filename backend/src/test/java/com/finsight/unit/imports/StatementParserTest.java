package com.finsight.unit.imports;

import com.finsight.imports.service.CsvSanitizer;
import com.finsight.imports.service.ExcelStatementParser;
import com.finsight.imports.service.PdfStatementParser;
import com.finsight.imports.service.StatementParserFactory;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class StatementParserTest {

    private StatementParserFactory factory;
    private PdfStatementParser pdfParser;
    private ExcelStatementParser excelParser;

    @BeforeEach
    void setUp() {
        CsvSanitizer sanitizer = new CsvSanitizer();
        pdfParser = new PdfStatementParser(sanitizer);
        excelParser = new ExcelStatementParser(sanitizer);
        factory = new StatementParserFactory(pdfParser, excelParser);
    }

    @Test
    @DisplayName("Should detect file formats correctly by extension and mime type")
    void shouldDetectFormats() {
        MockMultipartFile csv = new MockMultipartFile("file", "statement.csv", "text/csv", "test".getBytes());
        MockMultipartFile pdf = new MockMultipartFile("file", "statement.pdf", "application/pdf", "test".getBytes());
        MockMultipartFile excel = new MockMultipartFile("file", "statement.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "test".getBytes());

        assertThat(factory.detectFormat(csv)).isEqualTo(StatementParserFactory.FileFormat.CSV);
        assertThat(factory.detectFormat(pdf)).isEqualTo(StatementParserFactory.FileFormat.PDF);
        assertThat(factory.detectFormat(excel)).isEqualTo(StatementParserFactory.FileFormat.EXCEL);
    }

    @Test
    @DisplayName("Should parse Excel spreadsheet (.xlsx) correctly")
    void shouldParseExcel() throws Exception {
        Workbook workbook = new XSSFWorkbook();
        Sheet sheet = workbook.createSheet("Transactions");

        // Header row
        Row header = sheet.createRow(0);
        header.createCell(0).setCellValue("Date");
        header.createCell(1).setCellValue("Description");
        header.createCell(2).setCellValue("Amount");

        // Data row 1: Expense
        Row r1 = sheet.createRow(1);
        r1.createCell(0).setCellValue("2026-03-15");
        r1.createCell(1).setCellValue("Coffee Shop");
        r1.createCell(2).setCellValue(-250.00);

        // Data row 2: Income
        Row r2 = sheet.createRow(2);
        r2.createCell(0).setCellValue("2026-03-16");
        r2.createCell(1).setCellValue("Salary Credit");
        r2.createCell(2).setCellValue(75000.00);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        workbook.write(out);
        workbook.close();

        var rows = excelParser.parse(new ByteArrayInputStream(out.toByteArray()), null);

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).valid()).isTrue();
        assertThat(rows.get(0).description()).isEqualTo("Coffee Shop");
        assertThat(rows.get(0).amount().doubleValue()).isEqualTo(250.00);
        assertThat(rows.get(0).direction().name()).isEqualTo("DEBIT");

        assertThat(rows.get(1).valid()).isTrue();
        assertThat(rows.get(1).description()).isEqualTo("Salary Credit");
        assertThat(rows.get(1).amount().doubleValue()).isEqualTo(75000.00);
        assertThat(rows.get(1).direction().name()).isEqualTo("CREDIT");
    }
}
