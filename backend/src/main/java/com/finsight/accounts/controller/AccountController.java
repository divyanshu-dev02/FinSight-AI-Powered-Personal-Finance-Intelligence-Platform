package com.finsight.accounts.controller;

import com.finsight.accounts.dto.AccountResponse;
import com.finsight.accounts.dto.CreateAccountRequest;
import com.finsight.accounts.dto.UpdateAccountRequest;
import com.finsight.accounts.service.AccountService;
import com.finsight.common.dto.ApiResponse;
import com.finsight.identity.entity.User;
import com.finsight.identity.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/accounts")
@Tag(name = "Accounts", description = "Financial account management")
@SecurityRequirement(name = "bearerAuth")
public class AccountController {

    private final AccountService accountService;
    private final UserService userService;

    public AccountController(AccountService accountService, UserService userService) {
        this.accountService = accountService;
        this.userService = userService;
    }

    @GetMapping
    @Operation(summary = "List accounts for authenticated user (optionally include archived/hidden accounts)")
    public ResponseEntity<ApiResponse<List<AccountResponse>>> getAccounts(
            @RequestParam(defaultValue = "false") boolean includeArchived,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        List<AccountResponse> accounts = accountService.getAccountsForUser(user, includeArchived);
        return ResponseEntity.ok(ApiResponse.success(accounts));
    }

    @PostMapping
    @Operation(summary = "Create a new financial account")
    public ResponseEntity<ApiResponse<AccountResponse>> createAccount(
            @Valid @RequestBody CreateAccountRequest request,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        AccountResponse response = accountService.createAccount(request, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/{accountId}")
    @Operation(summary = "Get an account by ID")
    public ResponseEntity<ApiResponse<AccountResponse>> getAccount(
            @PathVariable UUID accountId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        AccountResponse response = accountService.getAccountById(accountId, user);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PatchMapping("/{accountId}")
    @Operation(summary = "Update an account")
    public ResponseEntity<ApiResponse<AccountResponse>> updateAccount(
            @PathVariable UUID accountId,
            @Valid @RequestBody UpdateAccountRequest request,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        AccountResponse response = accountService.updateAccount(accountId, request, user);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/{accountId}")
    @Operation(summary = "Archive/hide an account (preserves transaction history and calculations)")
    public ResponseEntity<ApiResponse<Void>> deleteAccount(
            @PathVariable UUID accountId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        accountService.deleteAccount(accountId, user);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @DeleteMapping("/{accountId}/permanent")
    @Operation(summary = "Permanently delete an account and all its transactions")
    public ResponseEntity<ApiResponse<Void>> permanentlyDeleteAccount(
            @PathVariable UUID accountId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        accountService.hardDeleteAccount(accountId, user);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/{accountId}/restore")
    @Operation(summary = "Restore an archived account back to active status")
    public ResponseEntity<ApiResponse<AccountResponse>> restoreAccount(
            @PathVariable UUID accountId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        AccountResponse response = accountService.restoreAccount(accountId, user);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
