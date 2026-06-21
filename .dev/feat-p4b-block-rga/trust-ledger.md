# Trust Ledger — P4b 2-level 블록 RGA

## 통합 감사 (review)

순수 CRDT 로직 패키지(`@ieum/crdt`, 의존성 0, 네트워크/파일/DOM 없음). 전통적 보안 취약점(injection/authz/secret) 표면이 없다. CRITICAL/HIGH 없음. 아래는 정확성·P5 인계 관련 INFO.

### CRITICAL (0건)
없음.

### HIGH (0건)
없음.

### INFO (3건 — P5 인계)

- [INFO/USAGE] ~~`toWire`의 delete op siteId 도출은 target 노드의 site를 반환~~ → **해소됨(PR #9, Gemini HIGH)**: `toWire(op, seq, siteId)`의 siteId를 **필수 매개변수**로 변경하고 `originSiteId` 도출을 제거. 호출자가 항상 송신자 siteId를 명시하도록 타입 레벨에서 강제. delete op의 site 오염 위험 제거.

- [INFO/DESIGN] block-set-type LWW는 `doc.localClock`(사이트 로컬 단조 카운터) 기반이며 Lamport 클락이 아니다(수신 시 클락 전진 없음).
  - 근거: `setBlockType`이 `++doc.localClock`을 clock으로 사용. 사이트 간 클락 미동기화.
  - 영향: 동시 타입변경의 "승자"가 직관적 시간순과 다를 수 있으나 **모든 replica가 동일한 (clock,siteId) 최대를 선택 → 수렴은 보장**(AC-5/6/14 검증). MVP 수용.
  - 권고: P5에서 공정성이 필요하면 Lamport/하이브리드 클락으로 승급 검토.

- [INFO/SEMANTICS] 두 사용자가 같은 블록을 동시 분할하면 tail 텍스트가 **각 분할 블록에 복제**된다(예: "Hello"→[Hel, lo, lo]).
  - 근거: 각 split이 독립 InsertOp 시퀀스로 tail을 재삽입(§4M-5). 표준 CRDT 동시분할 의미론.
  - 영향: 데이터 손실 없음, 모든 replica 동일 수렴(결정론적). 단위 테스트는 AC-12(블록 tie-break)+AC-14(혼합 property)로 커버. 명시적 "동시 split-with-tail" 케이스는 P5 e2e에서 보강 권장.
  - 권고: 제품상 중복이 문제면 P5에서 분할 op에 인텐트 토큰/병합 정책 추가 검토.

## 미충족 AC
없음 (15/15 충족).
