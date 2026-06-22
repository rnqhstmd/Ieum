package com.ieum.common;

/**
 * 리소스가 만료되어 더 이상 유효하지 않음(410 Gone) 전용 예외.
 * 409(이미 처리됨)와 구분하기 위해 도입.
 * 예: 만료된 초대 토큰 수락 시도(AC-5, BR-3).
 */
public class GoneException extends RuntimeException {
    public GoneException(String message) {
        super(message);
    }
}
