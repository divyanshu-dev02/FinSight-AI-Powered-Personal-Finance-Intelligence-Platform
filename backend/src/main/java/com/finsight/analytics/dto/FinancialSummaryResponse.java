package com.finsight.analytics.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record FinancialSummaryResponse(
    BigDecimal totalNetWorth,
    BigDecimal totalIncome,
    BigDecimal totalExpense,
    BigDecimal netCashFlow,
    BigDecimal savingsRatePercentage,
    String currency,
    List<CategorySpendingResponse> categoryBreakdown
) {
    public record CategorySpendingResponse(
        UUID categoryId,
        String categoryName,
        String icon,
        String color,
        BigDecimal totalSpent,
        BigDecimal percentageOfTotal
    ) {}
}

