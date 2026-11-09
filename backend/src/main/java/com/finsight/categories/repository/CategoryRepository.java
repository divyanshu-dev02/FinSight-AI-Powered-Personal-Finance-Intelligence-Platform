package com.finsight.categories.repository;

import com.finsight.categories.entity.Category;
import com.finsight.categories.entity.CategoryType;
import com.finsight.identity.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CategoryRepository extends JpaRepository<Category, UUID> {

    @Query("SELECT c FROM Category c WHERE (c.user IS NULL OR c.user = :user) AND c.active = true ORDER BY c.name ASC")
    List<Category> findAllAvailableForUser(@Param("user") User user);

    @Query("SELECT c FROM Category c WHERE (c.user IS NULL OR c.user = :user) AND c.type = :type AND c.active = true ORDER BY c.name ASC")
    List<Category> findAllAvailableForUserAndType(@Param("user") User user, @Param("type") CategoryType type);

    @Query("SELECT c FROM Category c WHERE c.id = :id AND (c.user IS NULL OR c.user = :user)")
    Optional<Category> findByIdAndAvailableForUser(@Param("id") UUID id, @Param("user") User user);

    boolean existsByNameIgnoreCaseAndUserAndActiveTrue(String name, User user);
}

