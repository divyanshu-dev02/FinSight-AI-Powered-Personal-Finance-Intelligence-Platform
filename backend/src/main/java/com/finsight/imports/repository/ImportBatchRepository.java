package com.finsight.imports.repository;

import com.finsight.identity.entity.User;
import com.finsight.imports.entity.ImportBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ImportBatchRepository extends JpaRepository<ImportBatch, UUID> {
    List<ImportBatch> findByUserOrderByCreatedAtDesc(User user);
    Optional<ImportBatch> findByIdAndUser(UUID id, User user);
    Optional<ImportBatch> findByFileHashAndUser(String fileHash, User user);
}

