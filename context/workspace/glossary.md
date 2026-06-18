# 워크스페이스 도메인 용어집

| 용어 | 영문/코드 | 정의 |
|------|-----------|------|
| 워크스페이스 | `Workspace` | 문서(Page)를 담는 최상위 컨테이너. 모든 페이지는 반드시 하나의 워크스페이스에 속한다. |
| 개인 워크스페이스 | `PERSONAL` (`WorkspaceType`) | 최초 로그인 시 자동 생성되는 1인 전용 워크스페이스. 계정당 1개 고정이며 삭제 불가. |
| 공유 워크스페이스 | `SHARED` (`WorkspaceType`) | 사용자가 직접 생성하고 팀원을 초대해 협업하는 워크스페이스. 복수 멤버 가능. |
| 개인 워크스페이스 자동 생성 | — | Google OAuth 최초 로그인 시 단일 트랜잭션으로 `Workspace(PERSONAL)` + `Membership(OWNER)`를 함께 생성하는 절차. 이름 기본값: `{name}의 워크스페이스`. |
| 멤버십 | `Membership` | 사용자(User)와 워크스페이스(Workspace)를 연결하는 N:M 관계 엔티티. `role` 필드로 권한을 구분한다. |
| 역할 | `role` (`MemberRole`) | Membership에 부여되는 권한 레벨. MVP에서는 `OWNER`와 `MEMBER` 두 가지만 존재. |
| OWNER | `OWNER` (`MemberRole`) | 워크스페이스 **관리자**(admin). 초대·멤버 제거·역할 변경·워크스페이스 삭제를 전담한다. 공유 워크스페이스 생성자가 기본 OWNER이며, 워크스페이스당 최소 1명 이상 반드시 존재해야 한다. |
| MEMBER | `MEMBER` (`MemberRole`) | 초대받은 협업자 역할. 워크스페이스 내 모든 페이지 열람·편집 가능. 워크스페이스 구조 변경·멤버 관리 불가. |
| Viewer | `Viewer` | 읽기 전용 역할. **post-MVP** 로드맵에 포함되며 MVP에서는 구현하지 않는다. |
| 마지막 OWNER 규칙 | — | 워크스페이스에 OWNER가 1명뿐인 경우, 그 OWNER는 역할을 변경하거나 워크스페이스를 나갈 수 없다. 다른 멤버에게 OWNER를 먼저 부여해야 한다. |
| 초대 | `Invitation` | OWNER가 이메일 주소를 지정해 워크스페이스 합류를 요청하는 엔티티. 고유 토큰을 포함한 링크로 전달된다. |
| 초대 상태 | `InvitationStatus` | Invitation의 현재 상태값. `PENDING` → `ACCEPTED` \| `REVOKED` \| `EXPIRED` 단방향 전이. |
| PENDING | `PENDING` | 초대가 생성되어 수락 대기 중인 상태. |
| ACCEPTED | `ACCEPTED` | 초대받은 사용자가 링크를 클릭해 수락 완료한 상태. Membership이 생성됨. |
| REVOKED | `REVOKED` | OWNER가 명시적으로 초대를 취소한 상태. |
| EXPIRED | `EXPIRED` | `expiresAt` 경과로 자동 만료된 상태. lazy 처리(수락 시 검사) + Vercel Cron 일 1회 일괄 처리 병행. |
| 토큰 | `token` | 초대 링크에 포함되는 고유 식별자. `crypto.randomBytes(32)`로 생성하는 256-bit 무작위 값(hex). URL: `/invite/accept?token=<token>`. |
| expiresAt | `expiresAt` | 초대 토큰의 만료 일시. 생성 시점으로부터 **7일** 후. |
| ownerId | `Workspace.ownerId` | 워크스페이스 생성자(소유자)의 User ID. FK → User.id. |
| joinedAt | `Membership.joinedAt` | 사용자가 워크스페이스에 참여한 일시. |
| 멤버 초대 | — | OWNER가 이메일 입력 → Invitation 생성 → 이메일 발송(MVP: Resend) → 수신자가 링크 클릭 → Membership 생성으로 이어지는 전체 흐름. |
| 멤버 제거 | — | OWNER가 특정 MEMBER의 Membership 레코드를 삭제하는 액션. 해당 사용자의 WebSocket 연결도 즉시 종료(`ws.close(4003)`). |
| 역할 변경 | — | OWNER가 MEMBER에게 OWNER 역할을 부여하거나, OWNER를 MEMBER로 강등하는 액션. 마지막 OWNER는 강등 불가. |
