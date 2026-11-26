package com.finsight.planning;

import com.finsight.transactions.entity.TransactionDirection;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

public final class PlanningModels {

    private PlanningModels() {}

    enum Frequency {
        WEEKLY, MONTHLY;

        boolean occursOn(LocalDate firstDate, LocalDate dueDate) {
            if (dueDate.isBefore(firstDate)) {
                return false;
            }
            return switch (this) {
                case WEEKLY -> ChronoUnit.DAYS.between(firstDate, dueDate) % 7 == 0;
                case MONTHLY -> dueDate.getDayOfMonth() == Math.min(firstDate.getDayOfMonth(), dueDate.lengthOfMonth());
            };
        }
    }

    record BudgetInput(@NotNull UUID categoryId, @NotNull YearMonth month,
                       @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
                       @NotNull @DecimalMin("0.0001") @Digits(integer = 15, fraction = 4) BigDecimal amount) {}

    record GoalInput(@NotBlank @Size(max = 100) String name, @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
                     @NotNull @DecimalMin("0.0001") @Digits(integer = 15, fraction = 4) BigDecimal targetAmount,
                     @NotNull @DecimalMin("0") @Digits(integer = 15, fraction = 4) BigDecimal savedAmount,
                     LocalDate targetDate) {}

    record CommitmentInput(@NotBlank @Size(max = 100) String name, @NotNull UUID accountId,
                           @NotNull TransactionDirection direction,
                           @NotNull @DecimalMin("0.0001") @Digits(integer = 15, fraction = 4) BigDecimal amount,
                           @NotNull Frequency frequency, @NotNull LocalDate firstDate, @NotNull Boolean active) {}

    record PostingInput(@NotNull UUID transactionId) {}

    public record Budget(UUID id, UUID categoryId, String categoryName, String currency, BigDecimal amount, BigDecimal spent) {}
    public record Goal(UUID id, String name, String currency, BigDecimal targetAmount, BigDecimal savedAmount, LocalDate targetDate) {}
    record Commitment(UUID id, String name, UUID accountId, String accountName, String currency,
                      TransactionDirection direction, BigDecimal amount, Frequency frequency, LocalDate firstDate,
                      boolean active, boolean accountActive) {}
    public record Occurrence(UUID commitmentId, String name, String currency, TransactionDirection direction, BigDecimal amount,
                      LocalDate dueDate, UUID transactionId) {}
    record Candidate(UUID id, String description, LocalDate date, BigDecimal amount) {}
    public record Overview(YearMonth month, LocalDate today, LocalDate through, List<Budget> budgets, List<Goal> goals,
                    List<Commitment> commitments, List<Occurrence> occurrences) {}
}
