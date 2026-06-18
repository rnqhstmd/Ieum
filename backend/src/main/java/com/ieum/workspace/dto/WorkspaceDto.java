package com.ieum.workspace.dto;

import com.ieum.workspace.WorkspaceType;

import java.time.Instant;
import java.util.UUID;

/**
 * 워크스페이스 응답 DTO
 */
public record WorkspaceDto(
        UUID id,
        String name,
        WorkspaceType type,
        UUID ownerId,
        Instant createdAt
) {}
