package com.finsight.imports.service;

import com.finsight.categories.entity.Category;
import com.finsight.categories.entity.CategoryType;
import com.finsight.categories.repository.CategoryRepository;
import com.finsight.common.exception.BusinessException;
import com.finsight.identity.entity.User;
import com.finsight.imports.dto.ConfirmImportRequest.RowReview;
import com.finsight.transactions.entity.TransactionDirection;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

final class StatementCategoryReview {

    private final JdbcClient jdbc;
    private final CategoryRepository categories;
    private final User user;
    private final Map<UUID, Category> available = new HashMap<>();
    private final Map<RuleKey, UUID> saved = new HashMap<>();

    StatementCategoryReview(JdbcClient jdbc, CategoryRepository categories, User user) {
        this.jdbc = jdbc;
        this.categories = categories;
        this.user = user;
        categories.findAllAvailableForUser(user).forEach(category -> available.put(category.getId(), category));
        jdbc.sql("SELECT merchant_key, direction, category_id FROM import_category_rules WHERE user_id = :userId")
                .param("userId", user.getId())
                .query((rs, row) -> Map.entry(new RuleKey(rs.getString("merchant_key"),
                        TransactionDirection.valueOf(rs.getString("direction"))), rs.getObject("category_id", UUID.class)))
                .list().forEach(entry -> saved.put(entry.getKey(), entry.getValue()));
    }

    Suggestion suggest(CsvParserService.ParsedRow row) {
        Category rule = available.get(saved.get(key(row)));
        if (rule != null) {
            return new Suggestion(rule, true);
        }
        if (hasCategory(row.categoryName())) {
            return new Suggestion(find(row.categoryName().strip(), row.direction()), false);
        }

        String text = (normalizedMerchant(row.merchant()) + " " + row.description()).toLowerCase(Locale.ROOT);
        String name;
        if (row.direction() == TransactionDirection.CREDIT) {
            name = text.matches(".*\\b(salary|payroll)\\b.*") ? "Salary" : null;
        } else if (text.matches(".*\\b(groceries|grocery|supermarket)\\b.*")) {
            name = "Groceries";
        } else if (text.matches(".*\\b(electricity|broadband|utility bill)\\b.*")) {
            name = "Utilities";
        } else if (text.matches(".*\\b(metro|parking|railway)\\b.*")) {
            name = "Transportation";
        } else {
            name = null;
        }
        return new Suggestion(name == null ? null : find(name, row.direction()), false);
    }

    Category resolve(CsvParserService.ParsedRow row, RowReview review) {
        if (review != null) {
            Category selected = available.get(review.categoryId());
            if (review.categoryId() != null && (selected == null || selected.getType() != type(row.direction()))) {
                throw new BusinessException("INVALID_CATEGORY", "The selected category is unavailable for this row");
            }
            if (review.saveRule()) {
                saveRule(row, selected);
            }
            return selected;
        }

        Suggestion suggestion = suggest(row);
        if (suggestion.savedRule()) {
            return suggestion.category();
        }
        if (!hasCategory(row.categoryName())) {
            return null;
        }
        if (suggestion.category() != null) {
            return suggestion.category();
        }
        Category created = categories.save(new Category(user, row.categoryName().strip(), type(row.direction()),
                "tag", "#64748B", null));
        available.put(created.getId(), created);
        return created;
    }

    private void saveRule(CsvParserService.ParsedRow row, Category category) {
        RuleKey key = key(row);
        if (key.merchant().isEmpty() || category == null) {
            throw new BusinessException("INVALID_CATEGORY_RULE", "A rule needs a merchant and a category");
        }
        jdbc.sql("""
                INSERT INTO import_category_rules (user_id, merchant_key, direction, category_id)
                VALUES (:userId, :merchant, :direction, :categoryId)
                ON CONFLICT (user_id, merchant_key, direction)
                DO UPDATE SET category_id = EXCLUDED.category_id
                """)
                .param("userId", user.getId()).param("merchant", key.merchant())
                .param("direction", key.direction().name()).param("categoryId", category.getId()).update();
    }

    private Category find(String name, TransactionDirection direction) {
        return available.values().stream()
                .filter(c -> c.getType() == type(direction) && c.getName().equalsIgnoreCase(name))
                .findFirst().orElse(null);
    }

    private static boolean hasCategory(String name) {
        return name != null && !name.isBlank() && !"uncategorized".equalsIgnoreCase(name.strip());
    }

    static String normalizedMerchant(String merchant) {
        return merchant == null ? "" : merchant.strip().replaceAll("\\s+", " ");
    }

    private static RuleKey key(CsvParserService.ParsedRow row) {
        return new RuleKey(normalizedMerchant(row.merchant()).toLowerCase(Locale.ROOT), row.direction());
    }

    private static CategoryType type(TransactionDirection direction) {
        return direction == TransactionDirection.CREDIT ? CategoryType.INCOME : CategoryType.EXPENSE;
    }

    record Suggestion(Category category, boolean savedRule) {}
    private record RuleKey(String merchant, TransactionDirection direction) {}
}
