package com.finsight.imports.service;

import com.finsight.common.exception.BusinessException;
import com.finsight.transactions.entity.TransactionSource;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.util.Set;

/**
 * Factory that routes uploaded statement files to the correct parser
 * based on content type and file extension.
 */
@Component
public class StatementParserFactory {

    private final PdfStatementParser pdfParser;
    private final ExcelStatementParser excelParser;

    private static final Set<String> CSV_EXTENSIONS = Set.of("csv", "tsv", "txt");
    private static final Set<String> PDF_EXTENSIONS = Set.of("pdf");
    private static final Set<String> EXCEL_EXTENSIONS = Set.of("xlsx", "xls");

    private static final Set<String> CSV_MIME_TYPES = Set.of(
            "text/csv", "text/plain", "text/tab-separated-values",
            "application/csv", "application/vnd.ms-excel"
    );
    private static final Set<String> PDF_MIME_TYPES = Set.of(
            "application/pdf"
    );
    private static final Set<String> EXCEL_MIME_TYPES = Set.of(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel"
    );

    public StatementParserFactory(PdfStatementParser pdfParser, ExcelStatementParser excelParser) {
        this.pdfParser = pdfParser;
        this.excelParser = excelParser;
    }

    /**
     * Detect the file format from extension and content type.
     */
    public FileFormat detectFormat(MultipartFile file) {
        String extension = getExtension(file.getOriginalFilename());
        String contentType = file.getContentType();

        // Extension takes priority
        if (extension != null) {
            if (PDF_EXTENSIONS.contains(extension)) return FileFormat.PDF;
            if (EXCEL_EXTENSIONS.contains(extension)) return FileFormat.EXCEL;
            if (CSV_EXTENSIONS.contains(extension)) return FileFormat.CSV;
        }

        // Fall back to MIME type
        if (contentType != null) {
            if (PDF_MIME_TYPES.contains(contentType)) return FileFormat.PDF;
            // Note: application/vnd.ms-excel can be either CSV or Excel
            if (EXCEL_MIME_TYPES.contains(contentType) && !"xls".equals(extension)) return FileFormat.EXCEL;
            if (CSV_MIME_TYPES.contains(contentType)) return FileFormat.CSV;
        }

        throw new BusinessException("UNSUPPORTED_FORMAT",
                "Unsupported file format. Please upload a CSV, PDF, or Excel (.xlsx/.xls) file.");
    }

    /**
     * Get the appropriate parser for the given format.
     */
    public StatementParser getParser(FileFormat format) {
        return switch (format) {
            case PDF -> pdfParser;
            case EXCEL -> excelParser;
            case CSV -> null; // CSV uses the existing CsvParserService flow
        };
    }

    /**
     * Map file format to TransactionSource for persisted records.
     */
    public TransactionSource toTransactionSource(FileFormat format) {
        return switch (format) {
            case PDF -> TransactionSource.PDF;
            case EXCEL -> TransactionSource.EXCEL;
            case CSV -> TransactionSource.CSV;
        };
    }

    private String getExtension(String filename) {
        if (filename == null) return null;
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot >= filename.length() - 1) return null;
        return filename.substring(dot + 1).toLowerCase();
    }

    public enum FileFormat {
        CSV, PDF, EXCEL
    }
}
