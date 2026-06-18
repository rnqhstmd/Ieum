package com.ieum.common;

/**
 * API 에러 응답 공통 포맷.
 *
 * @param code    에러 코드 (예: "INVALID_ARGUMENT", "INTERNAL_ERROR")
 * @param message 사람이 읽을 수 있는 에러 메시지
 */
public record ErrorResponse(String code, String message) {
}
