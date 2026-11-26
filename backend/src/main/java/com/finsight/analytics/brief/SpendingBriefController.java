package com.finsight.analytics.brief;

import com.finsight.common.dto.ApiResponse;
import com.finsight.identity.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.YearMonth;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/dashboard/brief")
class SpendingBriefController {

    private final SpendingBriefService brief;
    private final UserService users;

    SpendingBriefController(SpendingBriefService brief, UserService users) {
        this.brief = brief;
        this.users = users;
    }

    @GetMapping
    ApiResponse<SpendingBriefService.Brief> get(@RequestParam YearMonth month, Authentication authentication) {
        return ApiResponse.success(brief.getBrief(users.findEntityByEmail(authentication.getName()), month));
    }

    @PutMapping("/dismissals/{findingId}")
    ResponseEntity<Void> dismiss(@PathVariable UUID findingId, Authentication authentication) {
        brief.dismiss(users.findEntityByEmail(authentication.getName()), findingId);
        return ResponseEntity.noContent().build();
    }
}
