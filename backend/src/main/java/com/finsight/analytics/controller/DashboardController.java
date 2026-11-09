package com.finsight.analytics.controller;

import com.finsight.analytics.dto.FinancialSummaryResponse;
import com.finsight.analytics.service.FinancialCalculationService;
import com.finsight.common.dto.ApiResponse;
import com.finsight.identity.entity.User;
import com.finsight.identity.service.UserService;
import com.finsight.transactions.dto.TransactionResponse;
import com.finsight.transactions.service.TransactionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.YearMonth;
import java.util.List;

@RestController
@RequestMapping("/api/v1/dashboard")
@Tag(name = "Dashboard", description = "Financial intelligence dashboard and summaries")
@SecurityRequirement(name = "bearerAuth")
public class DashboardController {

    private final FinancialCalculationService calculationService;
    private final TransactionService transactionService;
    private final UserService userService;

    public DashboardController(FinancialCalculationService calculationService,
                               TransactionService transactionService,
                               UserService userService) {
        this.calculationService = calculationService;
        this.transactionService = transactionService;
        this.userService = userService;
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

