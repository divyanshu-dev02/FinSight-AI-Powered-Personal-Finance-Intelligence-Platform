package com.finsight.planning;

import com.finsight.common.dto.ApiResponse;
import com.finsight.identity.entity.User;
import com.finsight.identity.service.UserService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static com.finsight.planning.PlanningModels.*;

@RestController
@RequestMapping("/api/v1/planning")
@Tag(name = "Financial planning", description = "Monthly budgets, savings goals and recurring commitments")
class PlanningController {

    private final PlanningService planning;
    private final UserService users;

    PlanningController(PlanningService planning, UserService users) {
        this.planning = planning;
        this.users = users;
    }

    @GetMapping
    ApiResponse<Overview> overview(@RequestParam(required = false) YearMonth month, Authentication authentication) {
        User user = currentUser(authentication);
        YearMonth selected = month == null ? YearMonth.now(ZoneId.of(user.getTimeZone())) : month;
        return ApiResponse.success(planning.overview(user, selected));
    }

    @PostMapping("/budgets")
    @ResponseStatus(HttpStatus.CREATED)
    ApiResponse<UUID> createBudget(@Valid @RequestBody BudgetInput input, Authentication authentication) {
        return ApiResponse.success(planning.writeBudget(currentUser(authentication), null, input));
    }

    @PutMapping("/budgets/{id}")
    ApiResponse<UUID> updateBudget(@PathVariable UUID id, @Valid @RequestBody BudgetInput input,
                                   Authentication authentication) {
        return ApiResponse.success(planning.writeBudget(currentUser(authentication), id, input));
    }

    @DeleteMapping("/budgets/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteBudget(@PathVariable UUID id, Authentication authentication) {
        planning.removeBudget(currentUser(authentication), id);
    }

    @PostMapping("/goals")
    @ResponseStatus(HttpStatus.CREATED)
    ApiResponse<UUID> createGoal(@Valid @RequestBody GoalInput input, Authentication authentication) {
        return ApiResponse.success(planning.writeGoal(currentUser(authentication), null, input));
    }

    @PutMapping("/goals/{id}")
    ApiResponse<UUID> updateGoal(@PathVariable UUID id, @Valid @RequestBody GoalInput input,
                                 Authentication authentication) {
        return ApiResponse.success(planning.writeGoal(currentUser(authentication), id, input));
    }

    @DeleteMapping("/goals/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteGoal(@PathVariable UUID id, Authentication authentication) {
        planning.removeGoal(currentUser(authentication), id);
    }

    @PostMapping("/commitments")
    @ResponseStatus(HttpStatus.CREATED)
    ApiResponse<UUID> createCommitment(@Valid @RequestBody CommitmentInput input, Authentication authentication) {
        return ApiResponse.success(planning.writeCommitment(currentUser(authentication), null, input));
    }

    @PutMapping("/commitments/{id}")
    ApiResponse<UUID> updateCommitment(@PathVariable UUID id, @Valid @RequestBody CommitmentInput input,
                                       Authentication authentication) {
        return ApiResponse.success(planning.writeCommitment(currentUser(authentication), id, input));
    }

    @GetMapping("/commitments/{id}/occurrences/{date}/candidates")
    ApiResponse<List<Candidate>> candidates(@PathVariable UUID id, @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                            Authentication authentication) {
        return ApiResponse.success(planning.candidates(currentUser(authentication), id, date));
    }

    @PutMapping("/commitments/{id}/occurrences/{date}/posting")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void linkPosting(@PathVariable UUID id, @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date, @Valid @RequestBody PostingInput input,
                     Authentication authentication) {
        planning.linkPosting(currentUser(authentication), id, date, input.transactionId());
    }

    @DeleteMapping("/commitments/{id}/occurrences/{date}/posting")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unlinkPosting(@PathVariable UUID id, @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date, Authentication authentication) {
        planning.unlinkPosting(currentUser(authentication), id, date);
    }

    private User currentUser(Authentication authentication) {
        return users.findEntityByEmail(authentication.getName());
    }
}
