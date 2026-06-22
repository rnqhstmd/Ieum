package com.ieum.invitation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 초대 리포지토리
 */
public interface InvitationRepository extends JpaRepository<Invitation, UUID> {

    Optional<Invitation> findByToken(String token);

    List<Invitation> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Invitation i SET i.status = com.ieum.invitation.InvitationStatus.EXPIRED " +
           "WHERE i.status = com.ieum.invitation.InvitationStatus.PENDING AND i.expiresAt < :now")
    int expirePendingBefore(@Param("now") Instant now);
}
