package com.finsight.copilot;

import com.finsight.analytics.service.SpendingPeriods;
import com.finsight.common.dto.ApiResponse;
import jakarta.validation.Valid;
import com.finsight.identity.service.UserService;
import com.finsight.transactions.repository.TransactionRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/copilot")
public class CopilotController {

    private final UserService users;
    private final TransactionRepository transactions;

    private final CopilotAgent agent;

    CopilotController(UserService users, TransactionRepository transactions, CopilotAgent agent) {
        this.users = users;
        this.transactions = transactions;
        this.agent = agent;
    }

    @GetMapping("/availability")
    ApiResponse<Boolean> availability() {
        return ApiResponse.success(agent.isAvailable());
    }

    @PostMapping("/chat")
    ApiResponse<CopilotAgent.Answer> chat(@Valid @RequestBody CopilotAgent.Request request, Authentication authentication) {
        return ApiResponse.success(agent.answer(users.findEntityByEmail(authentication.getName()), request));
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiResponse<Void>> questionError(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode())
                .body(ApiResponse.error("COPILOT_UNAVAILABLE", exception.getReason()));
    }

    @GetMapping("/spending")
    ApiResponse<Spending> spending(@RequestParam YearMonth month,
                                   @RequestParam(defaultValue = "false") boolean comparable,
                                   Authentication authentication) {
        var user = users.findEntityByEmail(authentication.getName());
        var previousMonth = month.minusMonths(1);
        SpendingPeriods periods = comparable
                ? SpendingPeriods.comparable(month, LocalDate.now(ZoneId.of(user.getTimeZone())))
                : SpendingPeriods.fullMonths(month);
        var current = transactions.spendingByCurrency(user, periods.currentStart(), periods.currentEnd()).stream()
                .map(total -> new CurrencyTotal(total.getCurrency(), total.getAmount())).toList();
        var previous = transactions.spendingByCurrency(user, periods.previousStart(), periods.previousEnd()).stream()
                .map(total -> new CurrencyTotal(total.getCurrency(), total.getAmount())).toList();
        var evidence = transactions.recentExpenses(user, periods.currentStart(), periods.currentEnd(),
                PageRequest.of(0, 5)).stream()
                .map(t -> new Expense(t.getId(), t.getTransactionDate().toString(), t.getAmount(), t.getCurrency()))
                .toList();
        return ApiResponse.success(new Spending(month, previousMonth, current, previous, evidence, Instant.now(), periods));
    }

    record Spending(YearMonth month, YearMonth previousMonth, List<CurrencyTotal> current,
                    List<CurrencyTotal> previous, List<Expense> evidence, Instant calculatedAt, SpendingPeriods periods) {}

    public record CurrencyTotal(String currency, BigDecimal amount) {}

    record Expense(UUID id, String date, BigDecimal amount, String currency) {}
}
