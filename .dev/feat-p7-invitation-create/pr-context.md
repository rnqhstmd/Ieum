# PR 컨텍스트: P7 슬라이스 ②a — 초대 생성 (INV-01/05)

## 배경
슬라이스 ①로 공유 워크스페이스를 만들 수 있게 됐다. 이제 OWNER가 팀원을 이메일로 초대할 수 있어야 협업이 시작된다. 이 PR은 P7 초대 흐름의 첫 단계인 **초대 생성**(토큰·7일 만료·이미멤버 차단·초대 메일 발송)을 구현한다. 초대 수락(토큰 검증·멤버십 생성·멱등)은 후속 슬라이스 ②b로 분리한다. P7 스캐폴드의 `InvitationService.createInvitation`/`toDto`는 스텁이었고 컨트롤러도 인증 미배선이었다 — 이를 채우고 권한(OWNER)·예외(409)를 배선했다.

## 요구사항 (INV-01/05)
- [Must] OWNER가 이메일·역할로 초대를 생성한다(256-bit 토큰, +7일 만료, status=PENDING, invitedById=요청자).
- [Must] OWNER만 생성 가능(MEMBER·비멤버 403).
- [Must] 이미 멤버인 이메일은 거부(409).
- [Must] 인증 요구(미인증 401), 요청자 신원은 세션에서 추출(invitedById 위조 불가).
- [Must] 초대 메일 발송 실패가 초대 생성을 막지 않는다(PENDING 유지).
- [Should] 빈 이메일 400, role 미지정 시 MEMBER 기본.

## 범위
- 구현: `InvitationService.createInvitation`/`normalizeEmail`/`toDto` + `AccessGuard` 주입, `InvitationController` 인증 배선, `ConflictException`(신규)+`ApiExceptionHandler` 409 매핑.
- 테스트: 서비스 단위 6건 + REST 통합 4건(201/403/401/409).
- 범위 밖(후속): 초대 수락(INV-02/06)·목록·철회·중복PENDING·실제 Resend HTTP 발송·만료 스케줄러·프론트 UI.

## Audit Summary
- 총 6건 (CRITICAL 0, HIGH 0, MEDIUM 2, LOW 2 / PASS 2)
- [PASS] invitedById 신뢰 경계(세션 추출, 위조 불가) · OWNER 강제+INV-05 중복 차단
- [MEDIUM] 초대 토큰 평문 저장 — 후속 해시 저장 검토(MVP 평문 확정)
- [MEDIUM] 서비스 경계 request null 가드 부재(슬라이스 ① 동일) — cross-review에서 핵심 방어 반영 예정
- [LOW] 409가 멤버 존재 노출(OWNER 한정) · 이메일 형식 미검증(실발송 시 검증)
