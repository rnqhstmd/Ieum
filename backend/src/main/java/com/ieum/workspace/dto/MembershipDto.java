package com.ieum.workspace.dto;

import com.ieum.workspace.MemberRole;

import java.time.Instant;
import java.util.UUID;

/**
 * 멤버십 응답 DTO
 */
public record MembershipDto(
        UUID membershipId,
        UUID userId,
        String userEmail,
        String userName,
        MemberRole role,
        Instant joinedAt
) {}
