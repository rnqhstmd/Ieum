package com.ieum.common;

/**
 * 리소스 상태 충돌(409 Conflict) 전용 예외.
 * 전역 IllegalStateException 매핑의 광범위 부작용을 피하기 위해 도입.
 * 예: 이미 워크스페이스 멤버인 이메일로 초대 생성 시도(INV-05).
 */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
