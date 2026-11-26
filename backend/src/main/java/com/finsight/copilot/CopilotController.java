package com.finsight.copilot;

import com.finsight.common.dto.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/copilot")
public class CopilotController {

    private final UserService users;
    private final TransactionRepository transactions;

    private final CopilotQuestionRouter router;

    CopilotController(UserService users, TransactionRepository transactions, CopilotQuestionRouter router) {
        this.users = users;
        this.transactions = transactions;
        this.router = router;
    }

    @GetMapping("/availability")
    ApiResponse<Boolean> availability() {
        return ApiResponse.success(router.isAvailable());
    }

    @PostMapping("/question")
    ResponseEntity<ApiResponse<CopilotQuestionRouter.Intent>> question(
            @Valid @RequestBody Question request, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success(router.classify(request.question(), authentication.getName())));
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiResponse<Void>> questionError(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode())
                .body(ApiResponse.error("COPILOT_UNAVAILABLE", exception.getReason()));
    }

    record Question(@NotBlank @Size(max = 300) String question, @AssertTrue boolean consent) {}

    @GetMapping("/spending")
    ApiResponse<Spending> spending(@RequestParam YearMonth month, Authentication authentication) {
        var user = users.findEntityByEmail(authentication.getName());
        var previousMonth = month.minusMonths(1);
        var current = transactions.spendingByCurrency(user, month.atDay(1), month.atEndOfMonth()).stream()
                .map(total -> new CurrencyTotal(total.getCurrency(), total.getAmount())).toList();
        var previous = transactions.spendingByCurrency(user, previousMonth.atDay(1), previousMonth.atEndOfMonth()).stream()
                .map(total -> new CurrencyTotal(total.getCurrency(), total.getAmount())).toList();
        var evidence = transactions.recentExpenses(user, month.atDay(1), month.atEndOfMonth(),
                PageRequest.of(0, 5)).stream()
                .map(t -> new Expense(t.getId(), t.getTransactionDate().toString(), t.getAmount(), t.getCurrency()))
                .toList();
        return ApiResponse.success(new Spending(month, previousMonth, current, previous, evidence, Instant.now()));
    }

    record Spending(YearMonth month, YearMonth previousMonth, List<CurrencyTotal> current,
                    List<CurrencyTotal> previous, List<Expense> evidence, Instant calculatedAt) {}

    public record CurrencyTotal(String currency, BigDecimal amount) {}

    record Expense(UUID id, String date, BigDecimal amount, String currency) {}
}
