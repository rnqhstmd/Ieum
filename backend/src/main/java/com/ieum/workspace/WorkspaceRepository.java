package com.ieum.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * 워크스페이스 리포지토리
 */
public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {

    boolean existsByOwnerIdAndType(UUID ownerId, WorkspaceType type);

    Optional<Workspace> findFirstByOwnerIdAndType(UUID ownerId, WorkspaceType type);
}
