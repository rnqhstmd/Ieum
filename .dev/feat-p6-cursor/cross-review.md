# Cross-Review 결과

- advisor: claude (qa-manager + security-auditor, cross-review 미션)
- 브랜치: feat/p6-cursor (base: feat/p6-presence — 적층)
- DEV_DIR: .dev/feat-p6-cursor
- 실행: 2026-06-21

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 anchorId 캡처(직전 문자) | O | anchor.ts indexToAnchorId + anchor.test AC-1 + useCrdtDocument onCursorMove |
| AC-2 앞쪽 삽입 후 anchorId 불변 | O | anchor.test AC-2(M1) resolve 3→5 동일 노드 |
| AC-3 tombstone→다음 문자 | O | anchor.ts:33-36 + anchor.test AC-3 |
| AC-4 tombstone 마지막→블록 끝 | O | anchor.ts:38 + anchor.test AC-4 |
| AC-5 debounce 50ms 1회 | O | Editor scheduleCursor clearTimeout+setTimeout + Editor.cursor.test AC-5(fake timer) |
| AC-6 빈 블록 null | O | anchor.ts:55 + anchor.test AC-6 |
| AC-7 자기 미렌더 | O | Editor overlaysFor clientId!==localClientId + join-ack clientId 경로 + 테스트 |
| AC-8 원격 렌더 색·이름 | O | Editor presences lookup + data-color/displayName + 테스트 |
| AC-9 presence-leave 커서 제거 | O | useCrdtDocument handlePresenceLeave + useCursor + 테스트 |
| AC-10 2탭 수렴 | O | cursor.convergence.test in-memory relay + resolveAnchorToIndex 2→3 동일 노드 |

**[Must] 10/10 충족.**

## 설계 범위 이탈
**이탈 없음.** 변경 25파일 전부 설계 변경 범위 또는 부속 context 문서(collaboration 3종) 갱신.

## trust-ledger 신선도 (수정 주장 교차확인 — security-auditor)
**C1/C2/C4/C5·C12 수정 주장 전건 코드 반영 — 허위 완료 없음.**
- C1(isRgaId `Number.isInteger && >=0`) ✓ ws/web protocol.ts + 테스트(1.5/-1/Infinity)
- C2(siteId 길이 MAX_SITE_ID=64) ✓ ws/web + 테스트('s'×100)
- C4(handlePresenceLeave useCallback 합성) ✓ useCrdtDocument
- C5/C12(Editor overlaysFor per-block idEquals 필터) ✓ + 테스트(blockId 'other' 미렌더)

## 정책/보안 정합 (BR-1~8 + 설계 보안 약속)
BR-1~8 전건 정합(anchorId·tombstone·debounce·자기미렌더·빈블록·색이름 lookup·presence-leave 제거·broadcast-only). isRgaId 가드·proto 가드·join-ack clientId 서버 태깅·broadcast 발신자 제외·anchor 종료성 전건 코드 확인.

## 신규 위험 (trust-ledger에 없는 것만 — 신규 Critical/HIGH 0)

### Warning
- **CR-1 [SPEC] cursor.convergence AC-10 "앞쪽 삽입" 보장 약함** — diffBlockText('abc'→'aXbc') 후 "B 삽입이 'b' 앞에 확정"을 주석으로만 설명. 삽입 op의 originId가 anchorB('b') 앞인지 코드로 단정하지 않음(문자열 diff에 암묵 위임). 권고: `localInlineInsert(docB,blockId,1,'X')` 직접 호출 또는 op originId 단정.

### Info
- **CR-2 [MAINT] Editor cursorTimer unmount cleanup 누락** — 언마운트 시 clearTimeout 없음 → 50ms 후 stale 클로저로 onCursorMove 호출 가능(clientRef null 체크로 무해하나 엄밀히 stale). 권고: useEffect cleanup에 clearTimeout.
- **CR-3 [SPEC] anchor.test AC-1 index 번호 vs PRD 예시 불일치** — 테스트 index 3('hel' 뒤) vs PRD "index 2(두 번째 'l')". 로직은 정확, 번호 예시만 상이(비버그).

### MEDIUM (security-auditor, trust-ledger C 외 신규)
- **N-2 [GAP] selectionchange 미구독 — FR-1 부분 미이행** — Editor가 onKeyUp/onClick만 구독, selectionchange(전역 이벤트, addEventListener 필요)는 없음. 화살표 키는 keyup으로 커버되나 마우스 드래그 선택 변경 등은 미캡처. PRD FR-1 명시(selectionchange/keyup/click) 대비 불일치 → 수정 또는 명시적 수용 결정 필요.
- **N-1 [GAP] bullet 블록 오버레이 기준점 구조 불일치** — bullet은 `<ul pl-6><li></ul>` 구조라 `<div relative>` 기준 absolute 오버레이 left가 텍스트 시작과 어긋남. AC 없음(픽셀 비목표) 수용. C6(테스트 미커버)와 별개(구조).
- **N-3 [ASSUMPTION] onCursorMove deps `[doc]` 불변성 주석 없음** — doc은 useRef 파생(참조 불변)이라 안전하나 onBlockInput과 달리 주석 부재.
- **N-4 [GAP] handlePresenceLeave가 useEffect deps에 없음, ESLint disable 주석 불완전** — 현재 안정(useCallback[] 의존)하나 정당화 주석 미비.
- **N-5 [RISK] cursor-update 수신측 pageId 미검증** — 서버 handleCursor가 joinedPage 가드하므로 정상 동작 시 무해. presence-update와 동일 수용 패턴(relay 신뢰 경계), 미문서화.

## 총평
- 강점: anchor 알고리즘·메시지 계약이 설계에 충실, trust-ledger 5건 허위 완료 없음, BR/보안 약속 전건 정합, AC 10/10·범위 이탈 0.
- 합산: **신규 Critical 0 / HIGH 0 / Warning 1 / Info 2 / MEDIUM 5**. 머지 차단 사유 없음.
- 권고: N-2(selectionchange) PRD 불일치 해소(구독 추가 또는 수용 명시), CR-1(테스트 강화)·CR-2(cleanup)·N-3/N-4(주석)는 저비용. N-1/N-5는 walking skeleton 수용.

## 처리 결과 (사용자: 핵심 수정 + 나머지 문서화)
- **N-2 수정**: Editor.tsx에 `document.addEventListener('selectionchange')` 구독 추가 — FR-1(selectionchange/keyup/click) 완성. 테스트 1건 추가.
- **CR-2 수정**: 동 useEffect cleanup에서 `clearTimeout(cursorTimer)` — 언마운트 stale 타이머 정리.
- **CR-1 수정**: cursor.convergence AC-10을 `localInlineInsert(docB, blockId, 1, 'X')`(originId='a', 앵커 앞 가시 index 1)로 전환 — "앞쪽 삽입"을 코드로 확정(diffBlockText 문자열 위임 제거). `docToBlocks(docB)='aXbc'` 단정 추가.
- **N-3/N-4 주석**: useCrdtDocument onCursorMove deps [doc] 불변성 + useEffect handlePresenceLeave 안정성 명시.
- **수용/문서화**: N-1(bullet 오버레이 기준점 — AC 없음 픽셀 비목표), N-5(cursor-update pageId 미검증 — relay 신뢰경계, presence-update 동일 패턴), CR-3(anchor.test index 번호 — 비버그).
- 재검증: crdt 64, ws-relay 43, web 135 = 242. 3 tsc 0. 회귀 0.
