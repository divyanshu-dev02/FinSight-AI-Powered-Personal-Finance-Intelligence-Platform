package com.finsight.unit.analytics;

import com.finsight.analytics.service.SpendingPeriods;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;

class SpendingPeriodsTest {

    @Test
    void monthToDateUsesOnlyDaysPresentInBothMonths() {
        var periods = SpendingPeriods.comparable(YearMonth.of(2025, 3), LocalDate.of(2025, 3, 30));

        assertThat(periods.currentEnd()).isEqualTo(LocalDate.of(2025, 3, 28));
        assertThat(periods.previousEnd()).isEqualTo(LocalDate.of(2025, 2, 28));
    }

    @Test
    void completedMonthsIncludeTheirActualLastDay() {
        var periods = SpendingPeriods.comparable(YearMonth.of(2025, 3), LocalDate.of(2025, 4, 1));

        assertThat(periods.currentEnd()).isEqualTo(LocalDate.of(2025, 3, 31));
        assertThat(periods.previousEnd()).isEqualTo(LocalDate.of(2025, 2, 28));
    }
}
