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

## review 2회차 — review-fix 검증 (2026-06-23)

### 해소 확인
- **H1(빈 catch 이중흡수)**: ✅ 해소 — removeMember disconnect 단일 호출, 흡수 책임 RestWsRelayAdminClient 내부로 일원화 + WsRelayAdminClient Javadoc.
- **H2(adminServer URIError/UUID)**: ✅ 해소 — decodeURIComponent try/catch→400 + UUID 정규식→400.
- **H3(BR-2 미구현)**: ✅ 해소 — removeMember에 방어 가드 구현(대상 OWNER && count<=1 → 400), BR-3→BR-4→BR-2 순서.
- 하드닝: admin-url blank 경고로그, disconnectUser readyState===OPEN 체크 적용.

### 판정
- quality-reviewer: **QUALITY PASS** (Critical 0, Important 0). Minor 3 이월(비차단): orElseThrow 중복, updateMemberRole findAllById 단건 단순화 여지, close code 4003 매직넘버.
- security-auditor: **CRITICAL 0 / HIGH 0** (1회차 HIGH 3 전부 해소). 신규 MEDIUM 1건.

### 신규 MEDIUM 1건 — 결정
- [문서불일치/MEDIUM] PRD BR-6 "커밋 후 admin 호출" vs 설계 §4 "@Transactional 내부 직접 호출(afterCommit 폐기, 단위 verify 가능)". 코드는 설계를 따름.
  - **결정 (권장 a)**: 설계 결정 유지(코드 변경 없음). PRD BR-6의 "커밋 후" 문구는 설계 §4로 대체됨을 본 원장 + PRD 구현노트에 기록. best-effort·localhost MVP에서 commit-전/후 차이의 실질 위험은 낮음(disconnect 실패는 롤백 없음, 역방향 commit 실패는 localhost 동기호출이라 극히 드묾). afterCommit 재이동은 P10+ 재검토 대상.

### 잔여 Minor 3건 — 비차단 폴리시(이번 PR 범위 외, 후속 정리 가능)
orElseThrow 중복 헬퍼화 / updateMemberRole 단건 findById 단순화 / WS close code 4003 명명 상수화.
