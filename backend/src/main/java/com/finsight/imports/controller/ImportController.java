package com.finsight.imports.controller;

import com.finsight.common.dto.ApiResponse;
import com.finsight.identity.entity.User;
import com.finsight.identity.service.UserService;
import com.finsight.imports.dto.ConfirmImportRequest;
import com.finsight.imports.dto.CsvPreviewResponse;
import com.finsight.imports.dto.ImportBatchResponse;
import com.finsight.imports.service.ImportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/transactions")
@Tag(name = "CSV Ingestion", description = "CSV statement import and batch tracking")
@SecurityRequirement(name = "bearerAuth")
public class ImportController {

    private final ImportService importService;
    private final UserService userService;

    public ImportController(ImportService importService, UserService userService) {
        this.importService = importService;
        this.userService = userService;
    }

    @PostMapping(value = "/import/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload statement CSV and get parsed preview with auto-detected columns")
    public ResponseEntity<ApiResponse<CsvPreviewResponse>> previewCsv(
            @RequestParam("file") MultipartFile file,
            @RequestParam("accountId") UUID accountId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        CsvPreviewResponse preview = importService.generatePreview(file, accountId, user);
        return ResponseEntity.ok(ApiResponse.success(preview));
    }

    @PostMapping("/import/confirm")
    @Operation(summary = "Confirm CSV import and batch-persist valid transactions")
    public ResponseEntity<ApiResponse<ImportBatchResponse>> confirmImport(
            @Valid @RequestBody ConfirmImportRequest request,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        ImportBatchResponse response = importService.confirmImport(request, user);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/imports")
    @Operation(summary = "List all import batches for the authenticated user")
    public ResponseEntity<ApiResponse<List<ImportBatchResponse>>> getImportBatches(Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        List<ImportBatchResponse> batches = importService.getImportBatchesForUser(user);
        return ResponseEntity.ok(ApiResponse.success(batches));
    }

    @GetMapping("/imports/{batchId}")
    @Operation(summary = "Get details and metrics of a specific import batch")
    public ResponseEntity<ApiResponse<ImportBatchResponse>> getImportBatch(
            @PathVariable UUID batchId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        ImportBatchResponse batch = importService.getImportBatchById(batchId, user);
        return ResponseEntity.ok(ApiResponse.success(batch));
    }
}
