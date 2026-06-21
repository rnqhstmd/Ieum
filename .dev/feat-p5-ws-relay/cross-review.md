# Cross-Review 결과

- advisor: claude (qa-manager + security-auditor, cross-review 미션)
- 브랜치: feat/p5-ws-relay (base: main)
- DEV_DIR: .dev/feat-p5-ws-relay
- 실행: 2026-06-21

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 relay ws 수락 | O | server.ts:createRelayServer + server.test.ts AC-1 |
| AC-2 join→join-ack | O | room.ts:join(connectedClients) + room.test.ts |
| AC-3 broadcast 발신자 제외 | O | room.ts:handleOp `peer===client continue` + convergence.test.ts |
| AC-4 op-ack 발신자 | O | room.ts:handleOp op-ack push + room.test.ts |
| AC-5 wire 봉투 송신 | O(보정) | relayClient.sendOp + opType 소문자 검증 |
| AC-6 수신 applyDocOp 화면반영 | O | useCrdtDocument.onRemoteOp + useCrdtDocument.test |
| AC-7 CRDT 진실원천 | O | EditorContainer→useCrdtDocument→Editor(docToBlocks) |
| AC-8 2탭 수렴 | O(보정) | convergence.test in-memory relay deepEqual (Playwright 대체) |
| AC-9 혼자접속 무오류 | O | room.ts handleOp op-ack 항상 + room.test |
| AC-10 자기op 미중복 | O | BR-2 발신자제외 → onRemoteOp 미호출, convergence.test |

**[Must] 10/10 충족.**

## 설계 범위 이탈
**이탈 없음.** 범위 외 수정 파일(context/*.md 3종, next.config.ts, package.json, pnpm-lock.yaml) 전부 문서 동기화 또는 불가피한 인프라 변경으로 정당화.

## trust-ledger 신선도 (수정 완료 7건 교차 확인)
**7건 전부 코드 반영 확인 — 허위 완료 없음.**
1. 소켓 error 핸들러(server.ts:48) ✓ 2. host 127.0.0.1(server.ts:17,32) ✓ 3. maxPayload 64KiB(server.ts:18,33) ✓ 4. 연결상한 1013(server.ts:19,40) ✓ 5. room 교차주입 가드(room.ts:44) ✓ 6. proto 가드+클라 op검증(양 protocol.ts) ✓ 7. retry dispose 가드(transport.ts:70) ✓

## 정책/보안 정합
BR-1~7 전부 정합, 설계 확정 결정 6건(구조편집 비활성·opType 소문자·crdt 타입전용·autosave 스텁 등) 전부 코드 실증 + 테스트 존재.

## 신규 위험 (trust-ledger에 없는 것만 — 신규 Critical/HIGH 0)

### Warning
- **CR-1 [MAINT] useCrdtDocument.ts** — `transportFactory` 변경 시 재배선 미발생(useEffect deps=[pageId]). 프로덕션 무해(EditorContainer 미전달)이나 훅 오용 방지 위해 "마운트 1회 캡처" 주석 권고.
- **CR-2 [SPEC/GAP] inMemoryRelay.ts onOpen no-op** — relayClient의 `onOpen→join` 자동 경로가 수렴 통합 테스트에서 미커버(convergence는 수동 join). relayClient.test가 별도 커버하나 통합 경로 갭. 주석 또는 onOpen 트리거 보완 권고.

### Info
- **CR-3 [CLEAN] crdtDocument.ts** — `createEmptyDocument`(빈 문서)+수동 genesis vs 테스트의 `createDocument`(기본 블록 포함) 이름 혼용 지적. **실제로는 의도적**: 고정 GENESIS_BLOCK_ID 제어를 위해 createEmptyDocument+makeBlockInsertOp 사용(createDocument는 siteId 기반 블록 생성이라 부적합). 비이슈, 주석으로 의도 명시 가능.

### MEDIUM (security-auditor, walking skeleton 범위)
- **CR-4 [GAP] main.ts SIGTERM/SIGINT 미처리** — 종료 신호 시 `server.close()` 미호출. 개발 서버 재시작 시 포트 점유 가능. server.close()는 이미 구현됨 — 진입점 연결만 필요. **실질 개선 가치 있음.**
- **CR-5 [GAP] useCrdtDocument clientRef null 시 op 무음 스킵** — 배선 전 입력 시 sendOp 스킵이 미문서화. 주석 권고.
- **CR-6 [GAP] createWebSocketTransport pending 버퍼 close 시 유실** — 초기 연결 시도 중 close되면 미전송 op 유실(retrying 중 유실과 별개 시나리오). 주석 권고(P8과 함께).
- **CR-7 [ASSUMPTION] convergence.test 수동 join / inMemoryRelay onOpen 미구현** — CR-2와 동일 근거. 주석 권고.
- **CR-8 [RISK] parseServerMessage op 추가 필드 미검증** — isWireEnvelope는 필수 필드만 검증, 추가 필드 잔존. 서버 신뢰 환경(walking skeleton)이라 저위험. trust-ledger siteId 스푸핑 수용 항목과 연결 문서화 권고.

## 총평
- 강점: 설계 인터페이스(RoomRegistry Dispatch·Transport 격리·genesis·in-memory 수렴 검증)가 코드에 충실 반영. AC 10/10, 범위 이탈 0, trust-ledger 7건 허위 완료 없음.
- 합산: **신규 Critical 0 / HIGH 0 / Warning 2 / Info 1 / MEDIUM 5**. 머지 차단 사유 없음.
- 권고: CR-4(graceful shutdown)는 실코드 개선 가치. 나머지는 주석/문서화 수준(walking skeleton 범위).

## 처리 결과 (사용자: CR-4 수정 + 나머지 주석)
- CR-4 (main.ts graceful shutdown): **수정됨** — SIGTERM/SIGINT → server.close()
- CR-1/CR-5 (useCrdtDocument): **주석** — transportFactory 1회 캡처, clientRef null 송신 스킵
- CR-6 (transport): **주석** — open 전 close 시 pending 유실 한계
- CR-2/CR-7 (inMemoryRelay): **주석** — onOpen no-op·수동 join 경로 분리
- CR-8 (protocol): **주석** — op 추가필드 미검증 신뢰경계
- CR-3 (crdtDocument): **주석** — createEmptyDocument+고정 genesis 의도
- 커밋: ad22fa5. 재검증: ws-relay 19/19, web 94/94, tsc 0.
