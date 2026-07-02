## Trust Ledger — CRDT op_type Java↔wire 정렬

### spec (review) — spec-reviewer
SPEC PASS — AC-1~8(Must 8/8) 전건 충족. 설계 범위 이탈 없음(새 마이그레이션 없음, OpService 스텁 유지, CrdtOpRepository 시그니처 불변).

### 코드 품질 (review) — quality-reviewer
Critical 0 / Important 0 / Minor 3(비차단, 전부 [동작불변]).
- [Minor] OpType.fromWire 매 호출 values() 선형탐색 O(5) — 5종이라 무해(Map 캐시 불필요).
- [Minor] AC-8 테스트가 Jackson 2(com.fasterxml.jackson.databind)로 검증 — 프로덕션은 Jackson 3(tools.jackson). @JsonValue/@JsonCreator는 공용 애노테이션이라 행위 동등, 현재 OpType JSON 직렬화 경로 없음(비차단).
- [Minor] CrdtOpPersistenceIntegrationTest seq 유니크 회피 주석 과장(@BeforeEach가 매 파라미터 새 DB) — 무해.
이중 매핑(@JsonValue/@JsonCreator + AttributeConverter)이 enum(toWire/fromWire)에 SSOT 위임 일관, 예외 처리·테스트 격리·cascade 복원 전부 양호.

### 통합 감사 (review) — security-auditor
CRITICAL 0 / HIGH 0 / MEDIUM 3. 감사 통과.
- [GAP/MEDIUM #1] convertToEntityAttribute IAE의 Hibernate 래핑 시 root cause 보존이 실 read 경로 통합으로 미검증 — V3 CHECK가 미지 행 삽입을 물리 차단해 오늘 시점 트리거 불가. 권고: 인계 메모(또는 CHECK 일시완화 스파이크).
- [ASSUMPTION/MEDIUM #2] AC-8 Jackson 왕복이 Jackson 2(테스트)로 검증되나 프로덕션은 Jackson 3(tools.jackson). @JsonValue/@JsonCreator 공용 애노테이션 + 현재 OpType JSON 경로 없음 → 실효 낮음. 권고: Phase 2 SyncResponse 시 tools.jackson ObjectMapper 재검증.
- [ASSUMPTION/MEDIUM #3] V3 DB CHECK / Java OpType / @ieum/crdt AnyOp 3자 SSOT 정합을 잠그는 자동 크로스 테스트 부재 — 오늘 3곳 정확 일치 확인. design.md가 이미 인계 리스크로 명시. 별도 조치 없이 메모 유지.
- 교차검증 정합: FR-1~5·BR-1~3 코드·테스트 실증, @Enumerated 잔존 없음, V3 불변, new CrdtOp(...) 위치인자 생성자 호출처 없음(빌더만).

### 최종
Critical 0 / Important 0 / Security CRITICAL·HIGH 0. **리뷰 통과.**

### 리뷰 조치 결과
- [MEDIUM #2 Jackson 버전] → **해소**: OpTypeTest에 tools.jackson(Jackson 3) 왕복 검증 3케이스 추가 → @JsonValue/@JsonCreator가 프로덕션 Jackson 3에서도 소문자 wire 직렬화·역직렬화·미지값 예외 정상 동작 실증(OpTypeTest 19 pass).
- [MEDIUM #1 Hibernate 래핑 root cause] → 인계 메모(이연): V3 CHECK가 미지 행 삽입을 물리 차단해 오늘 트리거 불가. Phase 2 실 read 경로 활성화 시 Hibernate 래핑/로그 노출 스파이크 검증 권고.
- [MEDIUM #3 3자 SSOT 크로스가드] → 인계 메모(이연): V3/Java OpType/@ieum/crdt AnyOp 오늘 정확 일치. 향후 wire 6번째 op 추가 시 정합 깨짐 감지 자동가드 부재 — design.md에 이미 리스크 명시.
- 최종: Critical 0 / Important 0 / Security CRITICAL·HIGH 0. **리뷰 통과.**
