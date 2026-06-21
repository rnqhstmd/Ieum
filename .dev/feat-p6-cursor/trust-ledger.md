# Trust Ledger — P6 라이브 커서 (US-PRES-02)

## 통합 감사 (review) — security-auditor
신규 CRITICAL 0 / HIGH 3 / MEDIUM 6 / LOW 1 / ASSUMPTION 2. BR-1~8·FR-5/8·AC-7/10 전건 정합. displayName XSS(React 이스케이프)·color CSS 인젝션(hex 정규식 검증) 차단 확인. quality-reviewer: QUALITY PASS(Critical 0/Important 0).

| # | 분류/심각도 | 항목 | 위치 | 권고 |
|---|------------|------|------|------|
| C1 | RISK/HIGH | isRgaId counter 범위 미검증 — Infinity/NaN이 JSON 직렬화 시 null로 변환 → 모든 협업자 커서가 블록 맨 앞으로 점프 | ws/web protocol.ts isRgaId | `Number.isFinite && Number.isInteger && >=0` 추가 |
| C2 | RISK/HIGH | isRgaId siteId 길이 무제한 — ~60KB siteId가 room 인원 배 broadcast 증폭(DoS) | ws/web protocol.ts isRgaId | siteId 길이 상한(≤64) 추가 |
| C5 | GAP/HIGH | 존재하지 않는/삭제된 blockId 커서가 첫 블록 맨 앞에 오버레이(UX 오염) | Editor.tsx overlaysFor | blocks에 blockId 존재 시에만 렌더 |
| C12 | POLICY/MEDIUM | cursor blockId가 현재 pageId 소속인지 서버 미검증(relay 불투명) — C5와 동일 수신측 방어 | room.ts handleCursor | 수신측(Editor) blockId 존재 확인(C5와 합산) |
| C4 | RISK/MEDIUM | onPresenceLeave 인라인 람다 — 현재 안전(useCallback[] 캡처)이나 usePresence 변경 시 stale closure 잠재 | useCrdtDocument.ts | useCallback 합성으로 안정화 |
| C3 | RISK/MEDIUM | 서버 cursor rate-limit 없음 — 악성 클라 무제한 broadcast(클라 debounce는 정상 클라만) | server.ts/room.ts | per-client rate-limit(토큰 버킷). walking skeleton 수용/후속 |
| C6 | GAP/MEDIUM | bullet 블록 커서 offset 테스트 미커버 | Editor.cursor.test | bullet AC-5 케이스 추가 |
| C7 | GAP/MEDIUM | join-ack 전 cursor 전송 시 silent drop(BR-8 스펙 허용, 로깅 없음) | useCrdtDocument/room | 수용(BR-8) |
| C8 | GAP/LOW | AC-5 테스트가 blur 후 미전송(FR-8) 경로 미검증 | Editor.cursor.test | blur 케이스 추가 |
| C9 | ASSUMPTION/MEDIUM | isRgaId 중첩 proto 오염 — RgaId는 primitive 필드만이라 현재 안전 | protocol.ts | 수용(구조 확장 시 재검토) |
| C10 | ASSUMPTION/MEDIUM | resolveAnchorToIndex 종료성 — RGA next 순환 없음 전제(crdt invariant) | anchor.ts | 수용(crdt 보장) |
| C11 | ASSUMPTION/MEDIUM | localClientId=null 초기 자기 커서 미렌더 — 서버 BR-8 발신자 제외 보장에 의존 | Editor.tsx | 주석/테스트로 의존 명시 |

### 정합 (교차검증)
BR-1(anchorId)·BR-2(tombstone)·BR-3(debounce)·BR-4(자기 미렌더)·BR-5(빈블록 null)·BR-6(색·이름 lookup)·BR-7(presence-leave 커서제거)·BR-8(broadcast-only 비영속) 전건 코드+테스트 정합. AC-7 join-ack clientId 서버 태깅. clientId 클라 미전송(서버 부여). XSS/CSS 인젝션 차단.

### 수용 항목 (P5/P6 연장)
- 인증 목 처리(BR-2/5, displayName 신뢰 중계). cursor도 동일.
- 서버 rate-limit·half-open heartbeat 미도입 — walking skeleton 후속.
- 127.0.0.1·maxPayload·proto 가드 — cursor 경로도 동일 가드 적용 확인.

## 처리 결과 (사용자: 핵심 방어 수정 + 나머지 문서화)
- **C1 수정**: ws+web isRgaId에 `Number.isInteger(counter) && counter>=0` — Infinity/NaN/소수/음수 차단(JSON null화 커서 점프 방지). 테스트 ws 1+web 1.
- **C2 수정**: ws+web isRgaId에 `siteId.length<=64`(MAX_SITE_ID) — broadcast 증폭 차단. 테스트에 포함.
- **C5/C12 확정**: 존재하지 않는 blockId 커서는 Editor overlaysFor의 per-block `idEquals(c.blockId, block.id)` 필터로 이미 자동 제외 — 확정 테스트 추가(web +1) + 주석.
- **C4 수정**: useCrdtDocument onPresenceLeave 합성 콜백을 useCallback([presence.onPresenceLeave, cursor.onCursorLeave])로 안정화.
- **C11 주석**: localClientId=null 초기에도 자기 커서 미수신(서버 BR-8 발신자 제외 의존) 명시.
- **수용/문서화**: C3(서버 rate-limit — 후속 하드닝 슬라이스), C6(bullet 테스트)·C7(join 전 silent drop=BR-8)·C8(blur 테스트)·C9(중첩 proto 안전)·C10(RGA 순환 없음 crdt invariant).
- 재검증: crdt 64, ws-relay 43, web 134 = 241. 3 tsc 0. 회귀 0.
