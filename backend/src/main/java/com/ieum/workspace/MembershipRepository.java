package com.ieum.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 멤버십 리포지토리
 */
public interface MembershipRepository extends JpaRepository<Membership, UUID> {

    Optional<Membership> findByUserIdAndWorkspaceId(UUID userId, UUID workspaceId);

    List<Membership> findByUserId(UUID userId);

    List<Membership> findByWorkspaceId(UUID workspaceId);

    long countByWorkspaceIdAndRole(UUID workspaceId, MemberRole role);
}
