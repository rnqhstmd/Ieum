package com.ieum.page.dto;

import java.util.UUID;

/**
 * 페이지 생성 요청 DTO
 */
public record CreatePageRequest(
        /** 최상위 페이지 생성 시 null */
        UUID parentPageId,
        String title,
        String icon,
        /** 동일 레벨에서의 순서 (0-based) */
        int position
) {}
