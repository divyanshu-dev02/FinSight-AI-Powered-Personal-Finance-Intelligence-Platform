package com.finsight.accounts.repository;

import com.finsight.accounts.entity.FinancialAccount;
import com.finsight.identity.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FinancialAccountRepository extends JpaRepository<FinancialAccount, UUID> {
    List<FinancialAccount> findByUserAndActiveTrueOrderByCreatedAtDesc(User user);
    List<FinancialAccount> findByUserOrderByCreatedAtDesc(User user);
    Optional<FinancialAccount> findByIdAndUser(UUID id, User user);
    boolean existsByNameIgnoreCaseAndUserAndActiveTrue(String name, User user);
}

