package com.ieum.page.dto;

/**
 * 페이지 이름/아이콘 변경 요청 DTO
 */
public record UpdatePageRequest(
        String title,
        String icon
) {}
