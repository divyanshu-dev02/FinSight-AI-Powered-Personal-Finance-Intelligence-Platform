package com.finsight.unit.imports;

import com.finsight.imports.service.CsvSanitizer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CsvSanitizerTest {

    private CsvSanitizer sanitizer;

    @BeforeEach
    void setUp() {
        sanitizer = new CsvSanitizer();
    }

    @Test
    @DisplayName("Should neutralize dangerous formula injection prefixes")
    void shouldDisarmDangerousPrefixes() {
        assertThat(sanitizer.sanitize("=SUM(A1:A10)")).isEqualTo("'=SUM(A1:A10)");
        assertThat(sanitizer.sanitize("+cmd|' /C calc'!A0")).isEqualTo("'+cmd|' /C calc'!A0");
        assertThat(sanitizer.sanitize("-2+3*cmd|' /C calc'!A0")).isEqualTo("'-2+3*cmd|' /C calc'!A0");
        assertThat(sanitizer.sanitize("@SUM(1,2)")).isEqualTo("'@SUM(1,2)");
        assertThat(sanitizer.sanitize("\tmalicious")).isEqualTo("'\tmalicious");
    }

    @Test
    @DisplayName("Should preserve safe normal text without modifying")
    void shouldPreserveSafeText() {
        assertThat(sanitizer.sanitize("Amazon Store Purchase")).isEqualTo("Amazon Store Purchase");
        assertThat(sanitizer.sanitize("Uber *Ride 1234")).isEqualTo("Uber *Ride 1234");
        assertThat(sanitizer.sanitize("Salary Deposit")).isEqualTo("Salary Deposit");
        assertThat(sanitizer.sanitize("")).isEqualTo("");
        assertThat(sanitizer.sanitize(null)).isNull();
    }
}
