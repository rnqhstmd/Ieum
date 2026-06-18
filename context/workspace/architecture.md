# 워크스페이스 아키텍처

## 시스템 구조

### 1. Workspace 엔티티 구조

```
Workspace
  ├── id         (cuid)
  ├── name       (1~100자)
  ├── type       PERSONAL | SHARED
  ├── ownerId    → User.id  (생성자)
  └── createdAt
```

`type`은 생성 후 변경 불가. `PERSONAL`은 가입 시 1개 자동 생성되며 추가 생성·삭제 불가(이름변경만 허용). `SHARED`는 제한 없이 생성·삭제 가능.

### 2. Membership — User ↔ Workspace N:M 관계

```
Membership
  ├── id
  ├── userId       → User.id
  ├── workspaceId  → Workspace.id
  ├── role         OWNER | MEMBER
  └── joinedAt

유니크 제약: (userId, workspaceId)
```

모든 워크스페이스 접근은 Membership 존재 여부로 판단한다. 비멤버 접근 시 403 반환.

### 3. 개인 워크스페이스 자동 생성 트랜잭션

Google OAuth 콜백 완료 시 단일 트랜잭션으로 처리한다.

```
BEGIN TRANSACTION
  1. User upsert (googleId 기준)
  2. PERSONAL Workspace 존재 확인 (ownerId = userId, type = PERSONAL)
  3. 없으면:
     Workspace INSERT  { type: PERSONAL, name: "{name}의 워크스페이스", ownerId: userId }
     Membership INSERT { userId, workspaceId, role: OWNER }
COMMIT
```

재로그인 시 이미 존재하면 생성을 건너뛴다 (idempotent).

### 4. 공유 워크스페이스 생성

```
POST /api/workspaces  { name, type: "SHARED" }
  → Workspace INSERT  { type: SHARED, name, ownerId: 요청자 userId }
  → Membership INSERT { userId: 요청자, workspaceId, role: OWNER }
```

생성자는 자동으로 OWNER Membership을 부여받는다.

### 5. 초대 상태 전이

```
[*] → PENDING   : OWNER가 Invitation 생성 (token 발급, expiresAt = now + 7일)
                  → 초대 이메일 발송 (/invite/accept?token=<token>) — MVP: Resend로 실제 발송

PENDING → ACCEPTED : 수신자가 링크 클릭 → 로그인 확인 → 이메일 일치 검증
                     → 트랜잭션: Membership 생성 + Invitation.status = ACCEPTED
                     (단일 사용: 재수락 불가)

PENDING → REVOKED  : OWNER가 명시적 취소
                     → Invitation.status = REVOKED

PENDING → EXPIRED  : expiresAt 경과
                     → lazy(수락 시 검사) + Vercel Cron 일 1회 일괄 처리 병행
```

동일 이메일로 중복 초대 시 기존 PENDING을 REVOKED 처리 후 재생성한다.

### 6. OWNER / MEMBER 권한 차이

| 액션 | 개인 소유자 | OWNER | MEMBER |
|------|:-----------:|:-----:|:------:|
| 워크스페이스 정보 조회 | ✅ | ✅ | ✅ |
| 워크스페이스 이름 수정 | ✅ | ✅ | ❌ |
| 워크스페이스 삭제 | ✅ | ✅ | ❌ |
| 멤버 목록 조회 | ✅ | ✅ | ✅ |
| 멤버 초대 (Invitation 생성) | ❌ | ✅ | ❌ |
| 멤버 제거 | ❌ | ✅ | ❌ |
| 멤버 역할 변경 | ❌ | ✅ | ❌ |
| 스스로 나가기 | N/A | ✅¹ | ✅ |
| 페이지 CRUD | ✅ | ✅ | ✅ |
| 초대 생성·취소·조회 | ❌ | ✅ | ❌ |
| 초대 수락 | N/A | N/A | 초대받은 본인만 |

> ¹ 마지막 OWNER는 다른 OWNER를 지정하기 전까지 나갈 수 없다.

권한 검사는 Route Handler에서 `requireWorkspaceMember(userId, workspaceId, requiredRole?)` 헬퍼로 처리한다. 세션 인증 → 멤버십 확인 → 역할 비교 순서.

### 7. 마지막 OWNER 보호 규칙

다음 두 액션 실행 전 OWNER 수를 카운트한다.

- **역할 강등** (OWNER → MEMBER): `COUNT(OWNER) > 1` 인 경우에만 허용.
- **OWNER 나가기**: `COUNT(OWNER) > 1` 인 경우에만 허용. OWNER가 혼자 남은 경우 경고 표시.

### 8. 워크스페이스 삭제

OWNER만 실행 가능. 삭제 시 cascade:
- 하위 Page 전체 삭제 (및 연관 CrdtOp, Snapshot)
- 소속 Membership 전체 삭제
- 소속 Invitation 전체 삭제

Prisma 스키마에서 `onDelete: Cascade`로 처리.

### 9. 보안 고려사항

| 항목 | 대응 |
|------|------|
| 초대 토큰 추측 방지 | `crypto.randomBytes(32)` — 256-bit 무작위값 |
| 토큰 단일 사용 | 수락 즉시 `ACCEPTED` 전환, 재사용 불가 |
| 이메일 불일치 수락 시도 | `user.email !== invitation.email` → 403 |
| 중복 수락 경쟁 조건 | 트랜잭션 내 Membership 존재 여부 재확인 |
| MEMBER 권한 상승 시도 | Route Handler에서 OWNER 검증 → 403 |
| 멤버 제거 후 WebSocket | 해당 userId ws 연결 강제 종료 (`ws.close(4003)`) |

---

## 주제 문서

| 주제 | 설명 |
|------|------|
| [PRD §2·§7](../../requirements/02-prd.md) | 워크스페이스·초대 요구사항 (US-WS-01~04, US-INV-01~04) |
| [초대 흐름·권한 매트릭스](../../requirements/08-auth-and-permissions.md) | 상태전이 다이어그램·권한표·초대 생성/수락/취소 코드 |
| [데이터 모델](../../requirements/05-data-model.md) | Workspace/Membership/Invitation 스키마, §3.1 관계, §4.1 자동 생성 |
