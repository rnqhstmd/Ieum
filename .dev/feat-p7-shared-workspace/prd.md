# PRD: P7 공유 워크스페이스 생성 (US-WS-02) — 슬라이스 ①

## 배경

이음(Ieum)은 현재 로그인 시 자동 생성되는 **PERSONAL** 워크스페이스만 존재한다(P1). 팀 협업의 출발점인 **SHARED(공유) 워크스페이스를 사용자가 직접 만들 수 없다.** 공유 워크스페이스가 있어야 그 위에서 초대(INV)·역할 관리·멤버 제거가 성립하므로, 이 슬라이스는 P7 전체(초대/역할)의 **선행 조건**이다.

코드베이스에는 P7 스캐폴드가 이미 깔려 있으나(`WorkspaceController.createWorkspace`, `WorkspaceService.createSharedWorkspace`) 본문이 `throw new UnsupportedOperationException("TODO(Phase 1)")` 스텁이고, 컨트롤러가 인증 컨텍스트를 `currentUserId = null`로 미배선했다. 이 슬라이스는 **스텁을 실제 동작으로 채우고 인증을 배선**한다.

## 요구사항

### [Must]
- M1: 인증된 사용자가 이름을 지정해 공유(SHARED) 워크스페이스를 생성할 수 있다. 생성자에게 OWNER 멤버십이 자동 부여된다. (US-WS-02)
- M2: 워크스페이스 이름은 1자 이상 100자 이하여야 한다. 위반 시 생성이 거부된다. (US-WS-02)
- M3: 생성 엔드포인트(`POST /api/workspaces`)는 인증을 요구하며, 요청자의 신원을 인증 컨텍스트에서 추출한다(스텁 `null` 제거). 미인증 요청은 거부된다.

### [Should]
- S1: 이름의 앞뒤 공백은 제거(trim) 후 검증·저장한다. 공백만으로 이루어진 이름은 빈 이름으로 간주해 거부한다.

### [Could]
- C1: (이번 슬라이스 범위 밖) 동일 사용자의 공유 워크스페이스 개수 상한 — 추후 정책화.

## 수용 기준 (Given-When-Then)

### AC-1: 공유 워크스페이스 생성 시 SHARED 워크스페이스 + 생성자 OWNER 멤버십이 저장된다 (M1)
- **Given**: 인증된 사용자 U(userId)가 있고, 요청 이름은 "팀 워크스페이스"이다.
- **When**: `workspaceService.createSharedWorkspace(U, request("팀 워크스페이스"))`를 호출한다.
- **Then**: `type=SHARED`, `ownerId=U`, `name="팀 워크스페이스"`인 Workspace가 `workspaceRepository.save`로 저장되고, `userId=U`·`workspaceId=저장된 워크스페이스 id`·`role=OWNER`인 Membership이 `membershipRepository.save`로 저장되며, 반환된 `WorkspaceDto.type == SHARED` 이고 `WorkspaceDto.ownerId == U` 이고 `WorkspaceDto.name == "팀 워크스페이스"` 이다.

### AC-2: 이름 길이 경계값(1자·100자)은 정상 생성된다 (M2)
- **Given**: 인증된 사용자 U가 있다.
- **When**: 이름 길이가 정확히 1자("가") 또는 100자(100자 문자열)인 요청으로 `createSharedWorkspace`를 호출한다.
- **Then**: 두 경우 모두 `workspaceRepository.save`가 1회 호출되고, 반환된 `WorkspaceDto.name`이 입력 이름과 같다(예외가 발생하지 않는다).

### AC-3: 이름이 빈 문자열/공백/100자 초과면 거부되고 아무것도 저장되지 않는다 (M2, S1)
- **Given**: 인증된 사용자 U가 있다.
- **When**: 이름이 빈 문자열(`""`), 공백만(`"   "`), 또는 101자인 요청으로 `createSharedWorkspace`를 호출한다.
- **Then**: 각 경우 `IllegalArgumentException`이 발생하고, `workspaceRepository.save`와 `membershipRepository.save`는 한 번도 호출되지 않는다(`never()`).

### AC-4: REST — 인증 사용자가 유효 이름으로 POST 시 201과 SHARED 워크스페이스가 반환되고 OWNER 멤버십이 DB에 생성된다 (M1, M3)
- **Given**: `oauth2Login`으로 인증된 사용자(googleId→userId)와 요청 본문 `{"name":"팀"}`이 있다.
- **When**: `POST /api/workspaces`를 호출한다.
- **Then**: 응답이 `201 Created`이고, `$.type == "SHARED"`, `$.ownerId == 내 userId`, `$.name == "팀"`이며, 해당 워크스페이스에 대해 `role=OWNER`·`userId=내 userId`인 Membership row가 DB에 정확히 1건 존재한다.

### AC-5: REST — 이름이 유효하지 않으면 400을 반환한다 (M2)
- **Given**: 인증된 사용자와 요청 본문 `{"name":""}`(빈 이름)이 있다.
- **When**: `POST /api/workspaces`를 호출한다.
- **Then**: 응답이 `400 Bad Request`이고 응답 body의 `$.code == "INVALID_ARGUMENT"`이다.

### AC-6: REST — 미인증 요청은 401을 반환하고 워크스페이스를 생성하지 않는다 (M3)
- **Given**: 인증 정보가 없는 클라이언트와 요청 본문 `{"name":"팀"}`이 있다.
- **When**: `POST /api/workspaces`를 호출한다.
- **Then**: 응답이 `401 Unauthorized`이고, 워크스페이스가 새로 저장되지 않는다(요청 전후 workspaces 개수 동일).

## 범위 밖 (Out of Scope) — 후속 P7 슬라이스
- 초대 생성·수락(INV-01/02), 초대 취소(INV-03), 역할 변경·멤버 내보내기(US-INV-03)
- 워크스페이스 삭제·나가기(US-WS-04), WS-AUTH-04(멤버 제거 시 WS 강제종료)
- 초대 이메일 발송(INV-07)·만료 스케줄러(INV-04)
- 프론트엔드 생성 UI (이 슬라이스는 백엔드 API 한정)
- `renameWorkspace`/`listMembers`/`removeMember`/`updateMemberRole` 스텁(별도 슬라이스에서 채움)
