# 워크스페이스 구현 추적

## 범례

| 기호 | 의미 |
|------|------|
| ✅ | 반영됨 (구현 완료) |
| ⬜ | 미반영 (구현 전) |

---

## 요구사항 추적

### PRD §2 — 워크스페이스 (US-WS-01 ~ US-WS-04)

| 항목 | 사용자 스토리 | 핵심 수용 기준 | 상태 | 비고 |
|------|--------------|---------------|------|------|
| US-WS-01 | 로그인 시 개인 워크스페이스 자동 존재 | 최초 로그인 시 `type=PERSONAL` 워크스페이스 1개 자동 생성 | ⬜ | Phase 1 |
| US-WS-01 | 〃 | 개인 워크스페이스 추가 생성·삭제 불가 (1인 1개 고정) | ⬜ | Phase 1 |
| US-WS-02 | 새 공유 워크스페이스 생성 | 생성 시 생성자에게 OWNER Membership 자동 생성 | ⬜ | Phase 4 |
| US-WS-02 | 〃 | 워크스페이스 이름 1자 이상 100자 이하 | ⬜ | Phase 4 |
| US-WS-03 | 사이드바에서 워크스페이스 목록 확인·전환 | 사이드바에 개인·공유 워크스페이스 목록 표시 | ⬜ | Phase 1/4 |
| US-WS-04 | OWNER로서 공유 워크스페이스 삭제 | OWNER만 삭제 가능; 삭제 시 하위 페이지·멤버십 함께 삭제 | ⬜ | Phase 4 |
| US-WS-04 | 〃 | MEMBER는 나가기 가능 (Membership 삭제); 마지막 OWNER 나가기 시 경고 | ⬜ | Phase 4 |

### PRD §7 — 초대 및 역할 관리 (US-INV-01 ~ US-INV-04)

| 항목 | 사용자 스토리 | 핵심 수용 기준 | 상태 | 비고 |
|------|--------------|---------------|------|------|
| US-INV-01 | OWNER가 이메일로 팀원 초대 | OWNER가 이메일 입력해 Invitation 생성; 초대 이메일 발송 (MVP: Resend) | ⬜ | Phase 4 |
| US-INV-01 | 〃 | 이미 멤버인 이메일 초대 시 에러 메시지 반환 | ⬜ | Phase 4 |
| US-INV-02 | 초대 링크 클릭해 워크스페이스 합류 | 초대 링크는 고유 token 포함, 7일 후 만료 (expiresAt) | ⬜ | Phase 4 |
| US-INV-02 | 〃 | 로그인 상태면 즉시 Membership 생성; 미로그인이면 로그인 후 처리 | ⬜ | Phase 4 |
| US-INV-02 | 〃 | 초대 상태: `PENDING → ACCEPTED \| REVOKED \| EXPIRED` | ⬜ | Phase 4 |
| US-INV-03 | OWNER가 MEMBER 역할 변경·내보내기 | OWNER가 MEMBER에게 OWNER 역할 부여 가능 | ⬜ | Phase 4 |
| US-INV-03 | 〃 | OWNER가 MEMBER를 내보낼 수 있음 (Membership 삭제) | ⬜ | Phase 4 |
| US-INV-03 | 〃 | 마지막 OWNER는 역할 변경·나가기 불가 | ⬜ | Phase 4 |
| US-INV-04 | OWNER가 보류 중 초대 취소 | OWNER가 PENDING 초대를 REVOKED로 변경 가능 | ⬜ | Phase 4 |

### 권한 매트릭스 (08-auth-and-permissions.md §3)

| 항목 | 수용 기준 | 상태 | 비고 |
|------|-----------|------|------|
| 비멤버 접근 차단 | 워크스페이스 비멤버의 페이지 접근 시 403 반환 | ⬜ | Phase 4 |
| MEMBER 페이지 편집 | MEMBER는 워크스페이스 내 모든 페이지 편집 가능 | ⬜ | Phase 4 |
| 초대 생성 권한 | MEMBER의 초대 생성 시도 → 403 | ⬜ | Phase 4 |
| 멤버 제거 권한 | MEMBER의 다른 멤버 제거 시도 → 403 | ⬜ | Phase 4 |

---

## 구현 Phase 맵

| Phase | 내용 | 관련 항목 |
|-------|------|-----------|
| Phase 1 | 개인 워크스페이스 자동 생성, 페이지 CRUD, 에디터 | US-WS-01, US-WS-03(개인) |
| Phase 4 | 공유 워크스페이스, 초대, OWNER/MEMBER 역할 | US-WS-02~04, US-INV-01~04 |
