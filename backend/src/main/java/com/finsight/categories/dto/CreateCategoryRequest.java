package com.finsight.categories.dto;

import com.finsight.categories.entity.CategoryType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateCategoryRequest(
    @NotBlank(message = "Category name is required")
    @Size(min = 2, max = 100, message = "Category name must be between 2 and 100 characters")
    String name,

    @NotNull(message = "Category type is required")
    CategoryType type,

    @Size(max = 50, message = "Icon cannot exceed 50 characters")
    String icon,

    @Size(max = 20, message = "Color code cannot exceed 20 characters")
    String color,

    UUID parentId
) {}

