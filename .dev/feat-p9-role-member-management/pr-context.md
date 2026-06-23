# PR 컨텍스트 — P9 역할·멤버 관리

## 비즈니스 맥락
P8까지 초대 전 과정(생성·수락·철회·만료·메일)이 완료됐으나, 멤버 합류 **이후** 관리 수단이 없었다. P9는 그 공백을 닫고 권한 매트릭스를 엔드포인트 수준에서 마감한다.

**핵심 기능 (FR)**
- OWNER가 멤버 목록 조회·역할 변경(MEMBER↔OWNER)·멤버 내보내기 가능 (MEMBER도 목록 조회 가능, 비멤버 403)
- **마지막 OWNER 보호**: 마지막 OWNER 강등(BR-1)·제거(BR-2) 금지, 자기 제거 금지(BR-3) → 관리자 없는 워크스페이스 방지
- **멤버 제거 시 WebSocket 강제 종료**(WS-AUTH-04): Spring → ws-relay 별도 admin HTTP 엔드포인트 호출 → 해당 userId 소켓 `close(4003,"removed")` (best-effort, localhost)
- OWNER 전용 액션에 `requireOwner` 적용(PERM-03), 비OWNER 403(PERM-04)
- MEMBER 페이지 편집 권한 매트릭스 마감 + 회귀 방지 테스트

**주요 결정**
- WS 강제종료 = ws-relay 별도 admin 포트(기존 WebSocketServer 무수정 → 회귀 표면 0)
- 자기 강등은 OWNER 2명+ 시 허용(BR-1만 보호)
- disconnect 호출은 `@Transactional` 내부 직접 호출(best-effort, 예외 미전파; afterCommit 폐기 — 단위 verify 가능)

## 변경 범위
- backend: `WorkspaceService`(listMembers/removeMember/updateMemberRole), `WorkspaceController`(3 엔드포인트 배선), `MembershipRepository`(countByWorkspaceIdAndRole), `WsRelayAdminClient`/`RestWsRelayAdminClient`(신규), `application.yml`(WS_RELAY_ADMIN_URL)
- ws-relay: `server.ts`(userId 연결 추적·disconnectUser·adminPort), `adminServer.ts`(신규 admin http.Server), `main.ts`
- 테스트: 백엔드 199 + ws-relay 74 통과 (22개 AC 커버)

## Audit Summary
- 총 1회차 11건 → 2회차 전부 해소/문서화 (최종 CRITICAL 0, HIGH 0)
- [HIGH→해소] removeMember 빈 catch 이중 예외흡수 → 단일 호출로 일원화 + best-effort Javadoc
- [HIGH→해소] adminServer `decodeURIComponent` URIError 크래시 + UUID 미검증 → try/catch 400 + UUID 정규식 400
- [HIGH→해소] BR-2(마지막 OWNER 제거 금지) 미구현 → 방어 가드 추가
- [MEDIUM→수용/문서화] 동시성 락(post-MVP), tx내 HTTP(localhost 트레이드오프), admin 인증토큰(P11급), 컨테이너 host(배포 문서), PRD/설계 BR-6 호출시점(설계 결정 유지·PRD 구현노트 정합)
- 리뷰: spec PASS, quality PASS(Critical 0/Important 0), security CRITICAL/HIGH 0. 인수 ACCEPT([Must] 22/22)

(상세: `.dev/feat-p9-role-member-management/trust-ledger.md`)
