# PR 컨텍스트 — P6 라이브 커서 (US-PRES-02)

> **적층 PR**: 이 브랜치(feat/p6-cursor)는 feat/p6-presence(PR #11, 미머지) 위에 적층되어 있고 base는 feat/p6-presence입니다. PR #11이 main에 머지된 후 이 PR의 base를 main으로 변경하거나 순차 머지하세요.

## 배경
P6 아바타 목록(feat/p6-presence, PR #11)이 협업자 접속 여부를 색 배지로 보여주지만, 협업자가 문서 어디를 보는지는 알 수 없다. 이 슬라이스는 그 위에 라이브 커서를 적층한다. 핵심은 **anchorId 기반 커서** — 다른 협업자가 내 앞에 글자를 삽입/삭제해도 RGA 문자 id로 위치를 기억하므로 커서가 밀리지 않는다("편집에도 안 깨지는 앵커" 차별점).

## 요구사항 (walking skeleton)
- 협업자 caret 위치를 색 막대 + 이름 레이블로 에디터 내 실시간 표시.
- anchorId로 op 적용 후에도 올바른 문자 옆 유지, 앵커 문자 삭제 시 다음 문자/블록 끝으로 fallback.
- caret 이동은 50ms debounce 후 전송. 자기 커서는 미렌더(서버 부여 clientId로 식별).
- 확정 스코프: caret 커서만(선택영역 제외), anchorId=직전 문자, FR-7(이름 자동숨김) 제외, 커서 비영속(broadcast-only).

## 설계 핵심
- anchor 변환(resolveAnchorToIndex·indexToAnchorId)을 @ieum/crdt 신규 anchor.ts에 순수 함수로 — tombstone 인식 위해 RgaState.sentinel.next 전체 순회. crdt 단위 테스트로 결정적 검증.
- cursor-update 신규 메시지(서버가 clientId 태깅), RoomRegistry.handleCursor는 broadcast만(저장/roster 없음). 커서 제거는 presence-leave 재사용. join-ack에 clientId 추가(자기 식별).
- Editor는 DOM caret offset만 상위로 올리고(DocState 미주입), useCrdtDocument가 anchorId 변환·전송. debounce는 Editor 내부(테스트 격리). 원격 커서는 contentEditable 형제 오버레이.
- 검증: Playwright 미설치 → anchor·tombstone은 crdt 순수 단위, 2탭 커서 수렴은 in-memory relay 통합, DOM 렌더는 jsdom(픽셀 위치는 walking skeleton 비목표).

## Audit Summary
- 총 12건 (CRITICAL: 0, HIGH: 3, MEDIUM: 6, LOW: 1) — 신규 차단 결함 없음. BR-1~8·AC-7/10 전건 정합, displayName XSS/color CSS 인젝션 차단 확인.
- [HIGH/수정] isRgaId counter 범위 검증 — Infinity/NaN이 JSON 직렬화 시 null로 변환되어 커서가 맨 앞으로 점프하는 것을 차단(Number.isInteger·>=0).
- [HIGH/수정] isRgaId siteId 길이 상한(≤64) — 대용량 siteId broadcast 증폭 차단.
- [HIGH/확정] 존재하지 않는 blockId 커서는 Editor per-block 필터로 이미 제외(유령 블록 방어) — 테스트 추가.
- [MEDIUM/수정] presence-leave 합성 콜백 useCallback 안정화(stale closure 방지).
- [수용/후속] 서버 cursor rate-limit, bullet/blur 테스트 보강, RGA 순환 invariant — 후속 하드닝.

## 테스트 증거
- crdt 64 + ws-relay 43 + web 134 = 241 통과. 3 패키지 tsc 0. web next build 통과.
