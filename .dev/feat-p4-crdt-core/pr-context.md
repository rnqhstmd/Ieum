## 비즈니스 맥락

Ieum의 실시간 공동편집은 외부 CRDT 라이브러리 없이 자체 RGA로 구현한다(정책: 외부 의존성 0). 본 PR은 `@ieum/crdt`의 **인라인 문자 RGA 코어**를 TDD로 완성한다 — 에디터(P3 이후)·협업(P5)·presence(P6)·타임머신(P5)의 데이터 기반.

- 범위: single-level 인라인 문자 RGA. `createRga`/`localInsert`/`localDelete`/`applyOp`(인과버퍼+tie-break+멱등)/`toText`/`serialize·deserialize`.
- 보장 속성: 수렴성·멱등성·교환법칙·인과 버퍼링 (07 §7, R01·R02 치명 리스크 방어).
- 범위 밖(후속): 2-level 블록 RGA, presence 앵커, ws relay/op 영속화 (P4b/P5/P6).

## 구현 하이라이트

- 정본(07) 의사코드의 미묘한 버그 2건 교정: sentinel originId 누수(로컬 head 삽입이 영구 버퍼링되던 문제), 형제 `===` 객체참조 비교.
- tie-break 삽입을 중첩 서브트리 건너뛰기로 정확히 구현 — 단순 형제 walk의 오정렬 회피(R01 직결).
- delete 인과 버퍼링(`pendingDeletes`): property 테스트(임의 도착순서 수렴)가 "missing-target delete no-op" 가정의 교환법칙 위반을 노출 → 보류 집합으로 교정.

## Audit Summary
- 총 4건 (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 1, INFO: 2)
- [MEDIUM/ASSUMPTION] deserialize는 서버 생성 스냅샷 무결성을 신뢰 — P5 경계에서 처리
- [LOW/RISK] orphan op 버퍼 무상한 — 인증 연결(P5) 전제로 위험 낮음, post-MVP 상한 고려
- 차단 항목 없음. MEDIUM/LOW는 모두 P5 relay/서버 경계 후속 항목.
