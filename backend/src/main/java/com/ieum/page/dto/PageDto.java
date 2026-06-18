package com.ieum.page.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 페이지 응답 DTO (트리 구조용 children 포함)
 */
public record PageDto(
        UUID id,
        UUID workspaceId,
        UUID parentPageId,
        String title,
        String icon,
        int position,
        UUID createdById,
        Instant createdAt,
        Instant updatedAt,
        /** 트리 조회 시 하위 페이지 목록, 단건 조회 시 null */
        List<PageDto> children
) {}
