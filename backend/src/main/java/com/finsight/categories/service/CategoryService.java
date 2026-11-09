package com.finsight.categories.service;

import com.finsight.categories.dto.CategoryResponse;
import com.finsight.categories.dto.CreateCategoryRequest;
import com.finsight.categories.entity.Category;
import com.finsight.categories.entity.CategoryType;
import com.finsight.categories.repository.CategoryRepository;
import com.finsight.common.exception.BusinessException;
import com.finsight.common.exception.ResourceNotFoundException;
import com.finsight.identity.entity.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class CategoryService {

    private final CategoryRepository categoryRepository;

    public CategoryService(CategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    public List<CategoryResponse> getCategoriesForUser(User user, CategoryType type) {
        List<Category> categories = (type != null)
                ? categoryRepository.findAllAvailableForUserAndType(user, type)
                : categoryRepository.findAllAvailableForUser(user);

        return categories.stream().map(CategoryResponse::fromEntity).toList();
    }

    public CategoryResponse getCategoryById(UUID categoryId, User user) {
        Category category = findCategoryOrThrow(categoryId, user);
        return CategoryResponse.fromEntity(category);
    }

    @Transactional
    public CategoryResponse createCategory(CreateCategoryRequest request, User user) {
        if (categoryRepository.existsByNameIgnoreCaseAndUserAndActiveTrue(request.name().trim(), user)) {
            throw new BusinessException("DUPLICATE_CATEGORY", "A custom category with this name already exists");
        }

        Category parent = null;
        if (request.parentId() != null) {
            parent = findCategoryOrThrow(request.parentId(), user);
        }

        Category category = new Category(
                user,
                request.name().trim(),
                request.type(),
                request.icon() != null ? request.icon().trim() : "tag",
                request.color() != null ? request.color().trim() : "#64748B",
                parent
        );

        Category saved = categoryRepository.save(category);
        return CategoryResponse.fromEntity(saved);
    }

    @Transactional
    public void deleteCategory(UUID categoryId, User user) {
        Category category = findCategoryOrThrow(categoryId, user);
        if (category.isSystemCategory()) {
            throw new BusinessException("IMMUTABLE_SYSTEM_CATEGORY", "System default categories cannot be deleted");
        }
        category.setActive(false);
        categoryRepository.save(category);
    }

    public Category findCategoryOrThrow(UUID categoryId, User user) {
        return categoryRepository.findByIdAndAvailableForUser(categoryId, user)
                .orElseThrow(() -> new ResourceNotFoundException("Category", "id", categoryId));
    }
}

