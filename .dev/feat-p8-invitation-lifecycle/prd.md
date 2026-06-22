# PRD: P8 — 초대 전 과정 (수락·철회·만료·메일)

## 배경

이음(Ieum) 협업 노션 클론. P7(PR #19)에서 초대 생성(INV-01/05/07)이 완료됐다. 현재 `acceptInvitation`·`revokeInvitation`·`listInvitations`가 `UnsupportedOperationException` 스텁(구현 가이드 주석 완비)이며, 컨트롤러 `currentUserId=null` 하드코딩 상태다. P8은 초대 라이프사이클의 나머지 상태 전이(PENDING → ACCEPTED / REVOKED / EXPIRED)를 채운다.

## 확정 결정 (사용자 승인)

- **D-1 수락 성공 응답**: **204 No Content** (바디 없음, 클라이언트가 별도 WS 조회로 이동). 현 컨트롤러 `noContent()` 선언과 일치.
- **D-2 멱등 처리 시 초대 상태**: 이미 멤버인 사용자가 PENDING 초대를 재수락하면 Membership은 중복 생성하지 않되 **invitation.status를 ACCEPTED로 전이**한다 (초대 이행 정리).

## 목표

- 초대받은 사용자가 토큰으로 워크스페이스에 합류한다.
- 초대 상태가 정확히 전이되고 모든 엣지케이스에서 명확한 HTTP 오류를 반환한다.
- OWNER가 보류 중 초대를 철회한다.
- 만료 초대가 정리되고, 실제 초대 메일이 발송된다.

## 요구사항

### 기능 요구사항
- **[Must] FR-1 초대 수락(INV-02)**: token 제출 시 단일 트랜잭션으로 토큰검증→상태검증→만료검증→이메일검증→Membership 생성→status ACCEPTED 전이.
- **[Must] FR-2 이메일 불일치 차단(INV-06)**: `invitation.email` ≠ 현재 로그인 사용자 이메일이면 거부(403).
- **[Must] FR-3 lazy 만료 검사(INV-04 lazy)**: 수락 중 `expiresAt < now`이면 status=EXPIRED 전이 후 410.
- **[Must] FR-4 컨트롤러 인증 연결**: accept/revoke/list의 `currentUserId=null`을 `requireCurrentUserId()`로 교체.
- **[Must] FR-5 초대 철회(INV-03/US-INV-04)**: OWNER가 PENDING 초대를 REVOKED 전이. 비PENDING은 철회 불가.
- **[Must] FR-6 초대 목록 조회**: OWNER가 WS 전체 초대 조회. `InvitationRepository.findByWorkspaceId` 추가.
- **[Should] FR-7 만료 스케줄러(INV-04)**: 일 1회 `expiresAt<now`인 PENDING 일괄 EXPIRED.
- **[Should] FR-8 Resend 실 HTTP 발송(INV-07)**: 주석 HTTP 호출 활성화 + `@TransactionalEventListener(AFTER_COMMIT)` 분리 + 초대 URL `@Value` 외부화.
- **[Could] FR-9 멱등(D-2)**: 이미 멤버면 Membership 중복 생성 없이 status ACCEPTED 전이 + 204.

### 비즈니스 규칙
- **[Must] BR-1**: 로그인 사용자만 수락 가능. 미인증 401.
- **[Must] BR-2**: PENDING만 ACCEPTED/REVOKED 전이 가능. 비PENDING 수락/철회 시도 → 409.
- **[Must] BR-3**: 만료 전이 시 HTTP 410(409와 구분).
- **[Must] BR-4**: OWNER만 철회. 비OWNER → 403.
- **[Must] BR-5**: 철회 `invitationId`가 `wsId` 소속 아니면 404.
- **[Must] BR-6**: Membership 생성 시 `invitation.role` 승계.
- **[Must] BR-7**: Membership 저장 + status 전이는 단일 트랜잭션(부분실패 전체 롤백).
- **[Should] BR-8**: 메일 발송 실패는 초대 생성 비차단(현행 fallback 유지).
- **[Should] QE-1**: 동일 토큰 동시 수락 시 Membership 1건만(DB unique 또는 락).

## 영향 범위
- 초대 생성(`createInvitation`) 변경 없음.
- 컨트롤러 `currentUserId=null` 제거 → 미인증 접근이 401로 변경.
- 신규 `GoneException`(410) + `ApiExceptionHandler` 매핑.
- `InvitationRepository.findByWorkspaceId`(후속①), `findByStatusAndExpiresAtBefore`(후속②) 추가.

---

## 수용 기준

### 이번 슬라이스 — 초대 수락(INV-02/06) + lazy 만료 + 인증 연결 + 멱등

**AC-1 유효 토큰 수락 → Membership 생성 + ACCEPTED**
```
Given: PENDING·미만료(expiresAt>now)·email=user@example.com 초대 존재, user@example.com 로그인(userId=A)
When:  POST /api/invitations/accept { "token": "<유효>" }
Then:  HTTP 204 / Membership(userId=A, workspaceId=초대WS, role=초대role) 1건 생성 / Invitation.status=ACCEPTED
       [FR-1, BR-6, BR-7, D-1]
```
**AC-2 없는 토큰 → 404**
```
Given: DB에 없는 임의 토큰
When:  POST /api/invitations/accept { "token": "nonexistent" }
Then:  HTTP 404 / Membership 생성 없음   [FR-1]
```
**AC-3 ACCEPTED 토큰 → 409**
```
Given: status=ACCEPTED 초대 토큰
When:  POST /api/invitations/accept { "token": "<해당>" }
Then:  HTTP 409 / Membership 추가 생성 없음   [FR-1, BR-2]
```
**AC-4 REVOKED 토큰 → 409**
```
Given: status=REVOKED 초대 토큰
When:  POST /api/invitations/accept { "token": "<해당>" }
Then:  HTTP 409   [FR-1, BR-2]
```
**AC-5 만료 토큰 → EXPIRED 전이 + 410**
```
Given: status=PENDING·expiresAt=now-1s 초대 토큰
When:  POST /api/invitations/accept { "token": "<해당>" }
Then:  HTTP 410 / Invitation.status=EXPIRED / Membership 생성 없음   [FR-1, FR-3, BR-3]
```
**AC-6 이미 EXPIRED 토큰 → 409**
```
Given: status=EXPIRED 초대 토큰
When:  POST /api/invitations/accept { "token": "<해당>" }
Then:  HTTP 409 (PENDING 아님)   [FR-1, BR-2]
```
**AC-7 이메일 불일치 → 403**
```
Given: email=user@example.com PENDING 토큰, other@example.com 로그인
When:  POST /api/invitations/accept { "token": "<해당>" }
Then:  HTTP 403 / Membership 생성 없음 / status 변경 없음   [FR-2]
```
**AC-8 이미 멤버(멱등) → 204 + ACCEPTED 전이**
```
Given: PENDING 토큰(email=user@example.com), user@example.com이 이미 해당 workspaceId Membership 보유(status는 PENDING)
When:  POST /api/invitations/accept { "token": "<해당>" }
Then:  HTTP 204 / Membership 추가 생성 없음 / Invitation.status=ACCEPTED   [FR-9, D-2]
```
**AC-9 미인증 → 401**
```
Given: 유효 PENDING 토큰, 로그인 세션 없음
When:  POST /api/invitations/accept { "token": "<해당>" }
Then:  HTTP 401   [BR-1, FR-4]
```
**AC-10 역할 승계**
```
Given: role=OWNER PENDING 토큰, 이메일 일치 로그인
When:  POST /api/invitations/accept { "token": "<해당>" }
Then:  생성 Membership.role=OWNER   [FR-1, BR-6]
```

### 후속① — 철회(FR-5/6)
**AC-11 OWNER PENDING 철회 → 204 + REVOKED**
```
Given: WS=W OWNER(O), PENDING invitationId=I(ws=W)
When:  DELETE /api/workspaces/W/invitations/I (OWNER 세션)
Then:  HTTP 204 / Invitation I.status=REVOKED   [FR-5, BR-4]
```
**AC-12 비OWNER 철회 → 403**
```
Given: WS=W MEMBER(M), PENDING I
When:  DELETE /api/workspaces/W/invitations/I (MEMBER 세션)
Then:  HTTP 403 / status 변경 없음   [FR-5, BR-4]
```
**AC-13 비PENDING 철회 → 409**
```
Given: WS=W OWNER, status=ACCEPTED invitationId=I
When:  DELETE /api/workspaces/W/invitations/I
Then:  HTTP 409 / status 변경 없음   [FR-5, BR-2]
```
**AC-14 타 WS 초대 철회 → 404**
```
Given: WS=W OWNER, invitationId=I(ws=W2, W≠W2)
When:  DELETE /api/workspaces/W/invitations/I
Then:  HTTP 404   [FR-5, BR-5]
```

### 후속② — 만료 스케줄러(FR-7)
**AC-15 일괄 만료**
```
Given: expiresAt<now PENDING 3건, expiresAt>now PENDING 2건
When:  스케줄러 메서드 실행
Then:  3건 status=EXPIRED, 2건 PENDING 유지   [FR-7]
```

### 후속③ — Resend 실발송(FR-8)
**AC-16 AFTER_COMMIT 발송**
```
Given: Resend API 키 설정, 유효 초대 생성 요청
When:  createInvitation 트랜잭션 커밋 완료
Then:  https://api.resend.com/emails 로 POST 1회, 커밋 이전엔 HTTP 호출 없음   [FR-8, BR-8]
```

---

## 범위 — gx-tdd 슬라이스

| 슬라이스 | 항목 | AC |
|----------|------|-----|
| **이번 PR** | FR-1·2·3·4·9, BR-1~7, GoneException+410 매핑 | AC-1~10 |
| 후속① | FR-5·6 (revoke + list + findByWorkspaceId) | AC-11~14 |
| 후속② | FR-7 (@Scheduled 일괄 EXPIRED + findByStatusAndExpiresAtBefore) | AC-15 |
| 후속③ | FR-8 (HTTP 활성화 + AFTER_COMMIT + @Value URL) | AC-16 |
