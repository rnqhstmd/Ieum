package com.ieum.common;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    // ── AccessDeniedException → 403 FORBIDDEN ────────────────────────────────

    @Test
    @DisplayName("AccessDeniedException 처리 — 403 상태코드와 code=FORBIDDEN ErrorResponse 반환")
    void handleAccessDeniedException_returns403WithForbiddenCode() {
        // Given
        AccessDeniedException ex = new AccessDeniedException("접근 거부");

        // When
        ResponseEntity<ErrorResponse> result = handler.handleAccessDeniedException(ex);

        // Then
        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(result.getBody()).isNotNull();
        assertThat(result.getBody().code()).isEqualTo("FORBIDDEN");
        assertThat(result.getBody().message()).isNotBlank();
    }

    // ── EntityNotFoundException → 404 NOT_FOUND ──────────────────────────────

    @Test
    @DisplayName("EntityNotFoundException 처리 — 404 상태코드와 code=NOT_FOUND ErrorResponse 반환")
    void handleEntityNotFoundException_returns404WithNotFoundCode() {
        // Given
        EntityNotFoundException ex = new EntityNotFoundException("리소스 없음");

        // When
        ResponseEntity<ErrorResponse> result = handler.handleEntityNotFoundException(ex);

        // Then
        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(result.getBody()).isNotNull();
        assertThat(result.getBody().code()).isEqualTo("NOT_FOUND");
        assertThat(result.getBody().message()).isNotBlank();
    }

    // ── SEC-HIGH: 403/404 일반 메시지 — 내부 예외 메시지 노출 금지 ─────────────

    @Test
    @DisplayName("SEC-HIGH: AccessDeniedException 내부 메시지 노출 금지 — 고정 문자열 '접근 권한이 없습니다.' 반환")
    void handleAccessDeniedException_returnsFixedMessage_notInternalMessage() {
        // Given: 내부 메시지가 담긴 예외 (핸들러가 이 메시지를 그대로 노출하면 보안 결함)
        AccessDeniedException ex = new AccessDeniedException("OWNER 권한이 필요합니다.");

        // When
        ResponseEntity<ErrorResponse> result = handler.handleAccessDeniedException(ex);

        // Then: 고정 문자열만 반환해야 함 — 내부 메시지("OWNER 권한이 필요합니다.") 노출 금지
        assertThat(result.getBody()).isNotNull();
        assertThat(result.getBody().message()).isEqualTo("접근 권한이 없습니다.");
    }

    @Test
    @DisplayName("SEC-HIGH: EntityNotFoundException 내부 메시지 노출 금지 — 고정 문자열 '요청한 리소스를 찾을 수 없습니다.' 반환")
    void handleEntityNotFoundException_returnsFixedMessage_notInternalMessage() {
        // Given: 내부 경로/ID가 담긴 예외 (핸들러가 이 메시지를 그대로 노출하면 보안 결함)
        EntityNotFoundException ex = new EntityNotFoundException("Workspace id=550e8400 not found");

        // When
        ResponseEntity<ErrorResponse> result = handler.handleEntityNotFoundException(ex);

        // Then: 고정 문자열만 반환해야 함 — 내부 ID/경로 노출 금지
        assertThat(result.getBody()).isNotNull();
        assertThat(result.getBody().message()).isEqualTo("요청한 리소스를 찾을 수 없습니다.");
    }

    // ── GoneException → 410 GONE (AC-5 만료 초대) ────────────────────────────

    @Test
    @DisplayName("GoneException 처리 — 410 상태코드와 code=GONE ErrorResponse 반환")
    void handleGone_returns410WithGoneCode() {
        // Given
        GoneException ex = new GoneException("만료된 초대입니다");

        // When
        ResponseEntity<ErrorResponse> result = handler.handleGone(ex);

        // Then
        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.GONE);
        assertThat(result.getBody()).isNotNull();
        assertThat(result.getBody().code()).isEqualTo("GONE");
        assertThat(result.getBody().message()).isNotBlank();
    }
}
