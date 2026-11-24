package com.finsight.transactions.controller;

import com.finsight.common.dto.ApiResponse;
import com.finsight.identity.entity.User;
import com.finsight.identity.service.UserService;
import com.finsight.transactions.dto.CreateTransactionRequest;
import com.finsight.transactions.dto.CreateTransferRequest;
import com.finsight.transactions.dto.TransactionResponse;
import com.finsight.transactions.dto.UpdateTransactionRequest;
import com.finsight.transactions.service.TransactionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/transactions")
@Tag(name = "Transactions", description = "Transaction management operations")
@SecurityRequirement(name = "bearerAuth")
public class TransactionController {

    private final TransactionService transactionService;
    private final UserService userService;

    public TransactionController(TransactionService transactionService, UserService userService) {
        this.transactionService = transactionService;
        this.userService = userService;
    }

    @GetMapping
    @Operation(summary = "List transactions with pagination for authenticated user")
    public ResponseEntity<ApiResponse<Page<TransactionResponse>>> getTransactions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean includeArchived,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        Pageable pageable = PageRequest.of(page, size);
        Page<TransactionResponse> transactions = transactionService.getTransactionsForUser(user, includeArchived, pageable);
        return ResponseEntity.ok(ApiResponse.success(transactions));
    }

    @PostMapping
    @Operation(summary = "Create a manual transaction")
    public ResponseEntity<ApiResponse<TransactionResponse>> createTransaction(
            @Valid @RequestBody CreateTransactionRequest request,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        TransactionResponse response = transactionService.createTransaction(request, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @PostMapping("/transfer")
    @Operation(summary = "Create a first-class internal transfer between two accounts")
    public ResponseEntity<ApiResponse<TransactionResponse>> createTransfer(
            @Valid @RequestBody CreateTransferRequest request,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        TransactionResponse response = transactionService.createTransfer(request, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/export")
    @Operation(summary = "Export all transactions as a downloadable CSV file")
    public ResponseEntity<byte[]> exportTransactions(Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        byte[] csvData = transactionService.exportTransactionsCsv(user);
        String filename = "finsight-transactions-" + LocalDate.now() + ".csv";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csvData);
    }

    @GetMapping("/{transactionId}")
    @Operation(summary = "Get transaction by ID")
    public ResponseEntity<ApiResponse<TransactionResponse>> getTransaction(
            @PathVariable UUID transactionId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        TransactionResponse response = transactionService.getTransactionById(transactionId, user);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PatchMapping("/{transactionId}")
    @Operation(summary = "Update an existing transaction")
    public ResponseEntity<ApiResponse<TransactionResponse>> updateTransaction(
            @PathVariable UUID transactionId,
            @Valid @RequestBody UpdateTransactionRequest request,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        TransactionResponse response = transactionService.updateTransaction(transactionId, request, user);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/{transactionId}")
    @Operation(summary = "Delete a transaction")
    public ResponseEntity<ApiResponse<Void>> deleteTransaction(
            @PathVariable UUID transactionId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        transactionService.deleteTransaction(transactionId, user);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}

