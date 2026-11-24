package com.finsight.imports.service;

import java.io.InputStream;
import java.util.List;

/**
 * Common interface for all statement parsers (CSV, PDF, Excel).
 * Each implementation extracts rows from a specific file format.
 */
public interface StatementParser {

    /**
     * Parse the input stream and return a list of parsed rows.
     *
     * @param inputStream the uploaded file content
     * @param password optional password for encrypted files (PDF); null if not applicable
     * @return list of parsed rows with date, description, amount, direction, etc.
     * @throws Exception if the file cannot be read or parsed
     */
    List<CsvParserService.ParsedRow> parse(InputStream inputStream, String password) throws Exception;

    /**
     * @return descriptive name of this parser for logging and error messages
     */
    String formatName();
}
