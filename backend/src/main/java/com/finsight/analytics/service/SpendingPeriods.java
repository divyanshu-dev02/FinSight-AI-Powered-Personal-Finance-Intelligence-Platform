package com.finsight.analytics.service;

import java.time.LocalDate;
import java.time.YearMonth;

public record SpendingPeriods(LocalDate currentStart, LocalDate currentEnd,
                              LocalDate previousStart, LocalDate previousEnd) {

    public static SpendingPeriods comparable(YearMonth month, LocalDate today) {
        YearMonth previous = month.minusMonths(1);
        if (month.equals(YearMonth.from(today))) {
            int throughDay = Math.min(today.getDayOfMonth(), previous.lengthOfMonth());
            return new SpendingPeriods(month.atDay(1), month.atDay(throughDay),
                    previous.atDay(1), previous.atDay(throughDay));
        }
        return fullMonths(month);
    }

    public static SpendingPeriods fullMonths(YearMonth month) {
        YearMonth previous = month.minusMonths(1);
        return new SpendingPeriods(month.atDay(1), month.atEndOfMonth(),
                previous.atDay(1), previous.atEndOfMonth());
    }
}
