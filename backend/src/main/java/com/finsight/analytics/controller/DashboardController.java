package com.finsight.analytics.controller;

import com.finsight.analytics.dto.FinancialSummaryResponse;
import com.finsight.analytics.service.FinancialCalculationService;
import com.finsight.common.dto.ApiResponse;
import com.finsight.identity.entity.User;
import com.finsight.identity.service.UserService;
import com.finsight.transactions.dto.TransactionResponse;
import com.finsight.transactions.repository.TransactionRepository;
import com.finsight.transactions.service.TransactionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/dashboard")
@Tag(name = "Dashboard", description = "Financial intelligence dashboard and summaries")
@SecurityRequirement(name = "bearerAuth")
public class DashboardController {

    private final FinancialCalculationService calculationService;
    private final TransactionService transactionService;
    private final UserService userService;
    private final TransactionRepository transactions;

    public DashboardController(FinancialCalculationService calculationService,
                               TransactionService transactionService,
                               UserService userService, TransactionRepository transactions) {
        this.calculationService = calculationService;
        this.transactionService = transactionService;
        this.userService = userService;
        this.transactions = transactions;
    }

    @GetMapping("/summary")
    @Operation(summary = "Get user monthly financial summary and net worth")
    public ResponseEntity<ApiResponse<FinancialSummaryResponse>> getSummary(
            @RequestParam(required = false) String month,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        YearMonth targetMonth = (month != null && !month.isBlank()) ? YearMonth.parse(month) : YearMonth.now();
        FinancialSummaryResponse summary = calculationService.calculateMonthlySummary(user, targetMonth);
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    @GetMapping("/spending-trend")
    @Operation(summary = "Get recorded expenses by currency for a preset or custom date range")
    public ApiResponse<SpendingTrend> spendingTrend(@RequestParam YearMonth month,
            @RequestParam(defaultValue = "6") int months, @RequestParam(required = false) LocalDate start,
            @RequestParam(required = false) LocalDate end, Authentication authentication) {
        if (months < 1 || months > 12 || (start == null) != (end == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select 1–12 months or provide both dates.");
        }
        LocalDate from = start == null ? month.minusMonths(months - 1).atDay(1) : start;
        LocalDate to = end == null ? month.atEndOfMonth() : end;
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        if (days < 1 || days > 366) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select an ordered range of up to 366 days.");
        }
        User user = userService.findEntityByEmail(authentication.getName());
        List<SpendingTotal> buckets = new ArrayList<>();
        List<CategoryTotal> categories = new ArrayList<>();
        List<MerchantTotal> merchants = new ArrayList<>();
        Map<String, BigDecimal> totals = new TreeMap<>();
        for (var row : transactions.spendingTrend(user.getId(), from, to, days <= 31)) {
            if (row.getBucket() != null) {
                buckets.add(new SpendingTotal(row.getBucket(), row.getCurrency(), row.getAmount()));
                totals.merge(row.getCurrency(), row.getAmount(), BigDecimal::add);
            } else if (row.getMerchant() != null) {
                merchants.add(new MerchantTotal(row.getMerchant(), row.getCurrency(), row.getAmount()));
            } else {
                categories.add(new CategoryTotal(row.getCategoryId(), row.getCategoryName(), row.getCurrency(), row.getAmount()));
            }
        }
        return ApiResponse.success(new SpendingTrend(buckets, totals, categories, merchants));
    }

    public record SpendingTrend(List<SpendingTotal> buckets, Map<String, BigDecimal> totals,
                                List<CategoryTotal> categories, List<MerchantTotal> merchants) {}

    public record MerchantTotal(String name, String currency, BigDecimal amount) {}

    public record CategoryTotal(UUID categoryId, String name, String currency, BigDecimal amount) {}

    public record SpendingTotal(String bucket, String currency, BigDecimal amount) {}

    @GetMapping("/recent-transactions")
    @Operation(summary = "Get latest transactions for dashboard preview")
    public ResponseEntity<ApiResponse<List<TransactionResponse>>> getRecentTransactions(
            @RequestParam(defaultValue = "5") int limit,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        Page<TransactionResponse> page = transactionService.getTransactionsForUser(user, PageRequest.of(0, limit));
        return ResponseEntity.ok(ApiResponse.success(page.getContent()));
    }
}

