package com.ieum.invitation.dto;

import com.ieum.invitation.InvitationStatus;
import com.ieum.workspace.MemberRole;

import java.time.Instant;
import java.util.UUID;

/**
 * 초대 응답 DTO
 */
public record InvitationDto(
        UUID id,
        UUID workspaceId,
        String email,
        UUID invitedById,
        MemberRole role,
        InvitationStatus status,
        Instant expiresAt,
        Instant createdAt
) {}
