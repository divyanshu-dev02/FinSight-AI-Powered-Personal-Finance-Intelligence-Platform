package com.finsight.categories.dto;

import com.finsight.categories.entity.Category;
import com.finsight.categories.entity.CategoryType;

import java.time.Instant;
import java.util.UUID;

public record CategoryResponse(
    UUID id,
    String name,
    CategoryType type,
    String icon,
    String color,
    UUID parentId,
    String parentName,
    boolean isSystem,
    boolean active,
    Instant createdAt
) {
    public static CategoryResponse fromEntity(Category category) {
        return new CategoryResponse(
            category.getId(),
            category.getName(),
            category.getType(),
            category.getIcon(),
            category.getColor(),
            category.getParent() != null ? category.getParent().getId() : null,
            category.getParent() != null ? category.getParent().getName() : null,
            category.isSystemCategory(),
            category.isActive(),
            category.getCreatedAt()
        );
    }
}

