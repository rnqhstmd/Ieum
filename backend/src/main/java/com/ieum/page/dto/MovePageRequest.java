package com.ieum.page.dto;

import java.util.UUID;

/**
 * 페이지 이동 요청 DTO
 */
public record MovePageRequest(
        /** 이동할 부모 페이지 ID (최상위로 이동 시 null) */
        UUID parentPageId,
        int position
) {}
