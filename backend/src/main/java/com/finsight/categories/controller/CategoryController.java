package com.finsight.categories.controller;

import com.finsight.categories.dto.CategoryResponse;
import com.finsight.categories.dto.CreateCategoryRequest;
import com.finsight.categories.entity.CategoryType;
import com.finsight.categories.service.CategoryService;
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
@RequestMapping("/api/v1/categories")
@Tag(name = "Categories", description = "Transaction category management")
@SecurityRequirement(name = "bearerAuth")
public class CategoryController {

    private final CategoryService categoryService;
    private final UserService userService;

    public CategoryController(CategoryService categoryService, UserService userService) {
        this.categoryService = categoryService;
        this.userService = userService;
    }

    @GetMapping
    @Operation(summary = "List categories available to authenticated user (system + custom)")
    public ResponseEntity<ApiResponse<List<CategoryResponse>>> getCategories(
            @RequestParam(required = false) CategoryType type,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        List<CategoryResponse> categories = categoryService.getCategoriesForUser(user, type);
        return ResponseEntity.ok(ApiResponse.success(categories));
    }

    @PostMapping
    @Operation(summary = "Create a custom category")
    public ResponseEntity<ApiResponse<CategoryResponse>> createCategory(
            @Valid @RequestBody CreateCategoryRequest request,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        CategoryResponse response = categoryService.createCategory(request, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @DeleteMapping("/{categoryId}")
    @Operation(summary = "Soft-delete a custom category")
    public ResponseEntity<ApiResponse<Void>> deleteCategory(
            @PathVariable UUID categoryId,
            Authentication authentication) {
        User user = userService.findEntityByEmail(authentication.getName());
        categoryService.deleteCategory(categoryId, user);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}

