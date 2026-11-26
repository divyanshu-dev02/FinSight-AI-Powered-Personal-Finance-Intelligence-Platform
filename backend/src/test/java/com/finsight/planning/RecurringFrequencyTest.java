package com.finsight.planning;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static com.finsight.planning.PlanningModels.Frequency.MONTHLY;
import static com.finsight.planning.PlanningModels.Frequency.WEEKLY;
import static org.assertj.core.api.Assertions.assertThat;

class RecurringFrequencyTest {

    @Test
    void monthlySchedulesUseTheLastDayOfShortMonthsAndKeepTheirOriginalAnchor() {
        LocalDate first = LocalDate.of(2024, 1, 31);

        assertThat(MONTHLY.occursOn(first, LocalDate.of(2023, 12, 31))).isFalse();
        assertThat(MONTHLY.occursOn(first, LocalDate.of(2024, 2, 29))).isTrue();
        assertThat(MONTHLY.occursOn(first, LocalDate.of(2024, 3, 29))).isFalse();
        assertThat(MONTHLY.occursOn(first, LocalDate.of(2024, 3, 31))).isTrue();
    }

    @Test
    void weeklySchedulesRepeatFromTheirFirstDate() {
        LocalDate first = LocalDate.of(2024, 1, 31);
        assertThat(WEEKLY.occursOn(first, first.minusWeeks(1))).isFalse();
        assertThat(WEEKLY.occursOn(first, first.plusWeeks(2))).isTrue();
        assertThat(WEEKLY.occursOn(first, first.plusDays(2))).isFalse();
    }
}
