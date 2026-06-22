# Trust Ledger — P9 역할·멤버 관리

## 통합 감사 (review) — 2026-06-22

### quality-reviewer (QUALITY FAIL: Critical 0 / Important 1 / Minor 4)
- **[Important] WorkspaceService.java:181-184** — removeMember disconnect 호출부 빈 catch(`catch(Exception ignored){}`) 이중 예외흡수. RestWsRelayAdminClient가 이미 내부 흡수+log.warn. 정본(InvitationService) 불일치. → 흡수 책임 일원화, 빈 catch 제거.
- [Minor] findByUserIdAndWorkspaceId().orElseThrow(EntityNotFoundException) 중복 2회 → 헬퍼 추출 가능.
- [Minor] updateMemberRole이 단건인데 listMembers의 findAllById+toMap 복붙(과한 구조).
- [Minor] ws-relay close code 4003 매직 넘버 반복(99/162).
- [Minor] disconnectUser.test.ts setTimeout 30ms 고정 대기 플레이키 가능성.

### security-auditor (CRITICAL 0 / HIGH 3 / MEDIUM 8)
- **[RISK/HIGH] WorkspaceService.java:181-184** — 이중 예외흡수(quality와 동일). 미래 클라 교체 시 서비스가 묵살하는 숨은 정책.
- **[RISK/HIGH] adminServer.ts:19** — `decodeURIComponent(userId)` 잘못된 퍼센트 인코딩(`%GG`)에서 URIError throw → http 핸들러 uncaught 위험. UUID 형식 검증 부재.
- **[GAP/HIGH] WorkspaceService.removeMember** — BR-2(마지막 OWNER 제거 금지) 가드 코드 미구현. PRD Must. 현 순서상 도달 불가하나 미래 순서 변경 시 무방비.
- [RISK/MEDIUM] WS_RELAY_ADMIN_URL 미설정 시 no-op + 경고 없음 → 운영 배포 시 WS 강제종료 조용히 무력화(QE-2 위반).
- [RISK/MEDIUM] admin DELETE 인증 토큰 없음(127.0.0.1 바인드로 격리되나 host 오설정/프록시 시 외부 노출 가능).
- [GAP/MEDIUM] 경쟁 조건 — 두 OWNER 동시 강등/제거로 OWNER 0명 가능(TOCTOU, 락 없음).
- [GAP/MEDIUM] removeMember @Transactional 내 HTTP 동기 호출 → 커밋 전 DB 커넥션 최대 10s 점유 가능.
- [GAP/MEDIUM] listMembers User 미존재 시 email/name null → 클라이언트 계약 불명확.
- [ASSUMPTION/MEDIUM] WS_RELAY_ADMIN_URL이 Spring/ws-relay 동일 호스트 가정(컨테이너 분리 시 127.0.0.1 도달 불가).
- [ASSUMPTION/MEDIUM] disconnectUser가 readyState 확인 없이 socket.close() 호출(sendAll은 OPEN 확인 패턴 사용).
- [POLICY/MEDIUM] renameWorkspace/deleteWorkspace(P10 범위)는 currentUserId=null 유지 → 현재 500. 향후 스텁 구현 시 인증 우회 위험.

### 교차 검증 정합 항목
FR-1 비멤버 403, FR-5 requireOwner 일관, BR-1 강등금지, BR-3 자기제거 우선, BR-4 404, BR-6 admin URL 외부화, adminServer 127.0.0.1 전용 — 전부 정합 확인.

## 조치 결정 (오케스트레이터 트리아지 — 사용자 승인 대기)
- **RGR 수정**: H1(빈 catch 제거+일원화), H2(URIError/UUID 검증), H3(BR-2 가드), 저비용 하드닝(admin-url 경고 로그, disconnectUser readyState 체크).
- **수용 위험(문서화)**: 동시성 락(post-MVP), tx내 HTTP 10s(localhost MVP 트레이드오프), best-effort WS 잔여창(BR-6 기수용), 컨테이너 host(배포 문서), listMembers null(방어적), admin 인증토큰(P11급 하드닝), rename/deleteWorkspace 스텁(P10 범위).
