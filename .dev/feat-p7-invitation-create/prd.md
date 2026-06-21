# PRD: P7 슬라이스 ②a — 초대 생성 (INV-01/05 + 메일 fallback)

## 배경
슬라이스 ①로 공유(SHARED) 워크스페이스를 만들 수 있게 됐다. 이제 OWNER가 팀원을 이메일로 **초대**할 수 있어야 협업이 시작된다. 이 슬라이스는 초대 **생성**(토큰 발급·7일 만료·이미멤버 차단·초대 메일 발송)을 구현한다. 초대 **수락**(토큰 검증·만료·멤버십 생성·멱등)은 후속 슬라이스 ②b로 분리한다.

P7 스캐폴드의 `InvitationService.createInvitation`/`toDto`는 `UnsupportedOperationException` 스텁이고, `InvitationController.createInvitation`은 `currentUserId=null`로 인증 미배선이다. 이 슬라이스는 스텁을 채우고 인증·권한(OWNER)·예외 매핑(409)을 배선한다.

## 요구사항

### [Must]
- M1 (INV-01): 인증된 OWNER가 이메일·역할로 초대를 생성한다. 저장 시 `status=PENDING`, `invitedById=요청자`, 256-bit(32바이트) 랜덤 토큰, 생성 시점 +7일 만료(`expiresAt`).
- M2 (권한 PERM-03/04): OWNER만 초대 생성 가능. MEMBER·비멤버 요청은 거부(403).
- M3 (INV-05): 초대 이메일이 이미 해당 워크스페이스의 멤버이면 거부(409).
- M4 (인증): 엔드포인트는 인증을 요구한다. 미인증은 거부(401). 요청자 신원은 서버측 세션에서 추출(invitedById 위조 불가).
- M5 (INV-07 fallback): 초대 메일 발송을 시도하되, **발송 실패가 초대 생성을 막지 않는다**(Invitation은 PENDING으로 저장 유지).

### [Should]
- S1: 이메일이 비어있으면(빈/공백) 거부(400). 역할(role) 미지정 시 MEMBER로 기본 적용.

### [Could]
- C1: (범위 밖) 동일 이메일 중복 PENDING 초대 차단 — 후속 슬라이스에서 정교화.

## 수용 기준 (Given-When-Then)

### AC-1: OWNER 초대 생성 시 PENDING Invitation이 저장된다 (M1)
- **Given**: OWNER U가 워크스페이스 W에 있고, 요청은 이메일 "new@x.com"·역할 MEMBER이며 해당 이메일은 W의 멤버가 아니다.
- **When**: `invitationService.createInvitation(U, W, {"new@x.com", MEMBER})`를 호출한다.
- **Then**: `invitationRepository.save`로 `status=PENDING`·`workspaceId=W`·`email="new@x.com"`·`invitedById=U`·`role=MEMBER`인 Invitation이 저장되고, 반환 `InvitationDto.status == PENDING` 이고 `dto.email == "new@x.com"` 이고 `dto.invitedById == U` 이다.

### AC-2: 토큰은 비어있지 않고 호출마다 서로 다르다 (M1)
- **Given**: OWNER U가 워크스페이스 W에 있다.
- **When**: `createInvitation`을 서로 다른 두 이메일로 2회 호출한다.
- **Then**: 저장된 두 Invitation의 `token`이 모두 null이 아니고 길이가 32자 이상이며, 두 토큰 값이 **서로 다르다**.

### AC-3: 만료는 생성 시점 +7일이다 (M1)
- **Given**: OWNER U가 워크스페이스 W에 있다.
- **When**: `createInvitation`을 호출한다(호출 시각 t).
- **Then**: 저장된 `expiresAt`이 `t+6일` 이후이고 `t+8일` 이전이다(7일 만료).

### AC-4: 비OWNER는 초대 생성이 거부되고 저장되지 않는다 (M2)
- **Given**: MEMBER M(OWNER 아님)이 워크스페이스 W에 있다.
- **When**: `createInvitation(M, W, {...})`를 호출한다.
- **Then**: `AccessDeniedException`이 발생하고(→403), `invitationRepository.save`가 호출되지 않는다(`never()`).

### AC-5: 이미 멤버인 이메일 초대는 거부되고 저장되지 않는다 (M3)
- **Given**: OWNER U가 워크스페이스 W에 있고, 이메일 "exist@x.com"의 User가 이미 W의 멤버이다.
- **When**: `createInvitation(U, W, {"exist@x.com", MEMBER})`를 호출한다.
- **Then**: `ConflictException`이 발생하고(→409), `invitationRepository.save`가 호출되지 않는다(`never()`).

### AC-6: 초대 메일 발송이 실패해도 초대는 저장된다 (M5)
- **Given**: OWNER U가 워크스페이스 W에 있고, `resendEmailClient.sendInvitationEmail`이 호출 시 예외를 던진다.
- **When**: `createInvitation(U, W, {...})`를 호출한다.
- **Then**: 예외가 호출자에게 전파되지 않고, `invitationRepository.save`로 Invitation이 저장되며(`status=PENDING`) `InvitationDto`가 반환된다.

### AC-7: REST — 인증 OWNER가 POST 시 201 + PENDING + DB에 초대 1건 (M1, M4)
- **Given**: `oauth2Login` 인증된 OWNER와 요청 본문 `{"email":"new@x.com","role":"MEMBER"}`, 대상 워크스페이스 wsId가 있다.
- **When**: `POST /api/workspaces/{wsId}/invitations`를 호출한다.
- **Then**: 응답이 `201 Created`이고 `$.status == "PENDING"`, `$.workspaceId == wsId`, `$.email == "new@x.com"`이며, 해당 워크스페이스에 `status=PENDING`인 Invitation row가 DB에 1건 존재한다.

### AC-8: REST — 비OWNER(MEMBER) POST는 403을 반환한다 (M2)
- **Given**: `oauth2Login` 인증된 MEMBER(OWNER 아님)와 대상 워크스페이스 wsId가 있다.
- **When**: `POST /api/workspaces/{wsId}/invitations`를 호출한다.
- **Then**: 응답이 `403 Forbidden`이고 Invitation이 저장되지 않는다.

### AC-9: REST — 미인증 POST는 401을 반환한다 (M4)
- **Given**: 인증 정보가 없는 클라이언트와 요청 본문이 있다.
- **When**: `POST /api/workspaces/{wsId}/invitations`를 호출한다.
- **Then**: 응답이 `401 Unauthorized`이다.

### AC-10: REST — 이미 멤버인 이메일 POST는 409를 반환한다 (M3)
- **Given**: `oauth2Login` 인증된 OWNER와, 이미 해당 워크스페이스 멤버인 다른 User의 이메일을 담은 본문이 있다.
- **When**: `POST /api/workspaces/{wsId}/invitations`를 호출한다.
- **Then**: 응답이 `409 Conflict`이고 `$.code == "CONFLICT"`이다.

## 범위 밖 (Out of Scope) — 후속 슬라이스
- 초대 수락(INV-02/06), 목록 조회·철회(INV-03), 역할 변경·멤버 제거, WS 삭제
- 중복 PENDING 초대 차단(C1), 실제 Resend HTTP 발송(현재 no-op/TODO), 만료 스케줄러(INV-04)
- 프론트엔드 초대 UI
