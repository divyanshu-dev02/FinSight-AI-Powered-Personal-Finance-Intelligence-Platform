package com.finsight.imports.service;

import org.springframework.stereotype.Component;

/**
 * Sanitizes CSV cell contents against Formula Injection (CSV Injection / CWE-1236).
 * Disarms leading characters like '=', '+', '-', '@', '\t', '\r' that can trigger
 * formula execution in spreadsheet software (Excel, LibreOffice, Google Sheets).
 */
@Component
public class CsvSanitizer {

    private static final char[] DANGEROUS_PREFIXES = {'=', '+', '-', '@', '\t', '\r'};

    public String sanitize(String value) {
        if (value == null) {
            return null;
        }

        if (value.isEmpty()) {
            return value;
        }

        char firstChar = value.charAt(0);
        for (char dangerous : DANGEROUS_PREFIXES) {
            if (firstChar == dangerous) {
                return "'" + value;
            }
        }

        String trimmed = value.trim();
        if (!trimmed.isEmpty()) {
            char trimmedFirstChar = trimmed.charAt(0);
            for (char dangerous : DANGEROUS_PREFIXES) {
                if (trimmedFirstChar == dangerous) {
                    return "'" + trimmed;
                }
            }
        }

        return trimmed;
    }
}
