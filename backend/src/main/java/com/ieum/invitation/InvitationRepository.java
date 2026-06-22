package com.ieum.invitation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 초대 리포지토리
 */
public interface InvitationRepository extends JpaRepository<Invitation, UUID> {

    Optional<Invitation> findByToken(String token);

    List<Invitation> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);
}
