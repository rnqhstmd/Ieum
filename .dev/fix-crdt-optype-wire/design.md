# 설계서: CRDT op_type 표기 정렬 (Java ↔ wire 소문자 5종)

## 개요
DB(V3, 정본)를 건드리지 않고 Java 측 op_type 표현을 wire 소문자 5종에 정렬한다. `OpType` enum을 5종으로 확장(wire 매핑 내장)하고, `CrdtOp`의 영속화를 `@Enumerated(STRING)`에서 `@Convert(OpTypeConverter)`로 교체하며, JSON 직렬화까지 `@JsonValue/@JsonCreator`로 정렬한다. cascade 테스트의 native SQL 우회를 JPA 정상 경로로 복원한다.

## 설계 규모
**중형** — 단일 도메인(collaboration), 선형 참조. 신규 파일 2(컨버터 + 테스트 다수), 수정 4.

## 확정 설계 결정 (사용자 승인 + 검토 반영)
1. **[결정1] enum↔wire 매핑**: `OpType` 5종에 `wireValue` 필드 + `toWire()`/`fromWire(String)`를 SSOT로 둔다. 얇은 `AttributeConverter<OpType,String>`가 위임. `CrdtOp`는 `@Enumerated` 제거 → `@Convert`. (타입 안전성 유지 + 매핑 단일 정본 + 순수 단위 검증 가능)
2. **[결정2] 미지 문자열 예외**: `fromWire`가 매핑표 밖 값 → `IllegalArgumentException`(위반 값 포함 메시지). (사용자 확정)
3. **[결정3] @Convert 명시**: `@Converter`(autoApply=false) + `CrdtOp.opType`에만 `@Convert` 명시. (OpType 매핑 지점은 CrdtOp뿐, 전역 부작용 회피)
4. **[결정4] WsMessages**: `OpMessage.opType`은 `String` 유지 + **주석 두 곳(라인 32-33 Javadoc + 라인 39 인라인)** 을 wire 5종으로 정렬. (소비자 handleOp가 throw 스텁이라 enum 파싱 조기 도입 불필요 — critic 확인)
5. **[결정5] CrdtOp**: `@Enumerated`→`@Convert` 매핑 메타만 변경. 필드 타입 `OpType` 유지 → 빌더/getter/시그니처 무영향. `CrdtOpRepository` 시그니처 불변(컨버터 투명 처리).
6. **[결정6] FR-5 cascade 복원**: `WorkspaceDeleteLeaveIntegrationTest`의 native SQL crdt_ops 삽입 → `crdtOpRepository.save(CrdtOp.builder()...)`. 주석 제거, `jdbcTemplate` 필드(유일 사용처) 제거, 기존 assertion 보존. **결정6은 결정1~3(컨버터)과 원자적** — 컨버터 없이 복원만 하면 대문자 저장으로 V3 위반. RGR 순서상 T3(컨버터 적용) 후 T5(복원). (critic 지적)
7. **[결정7] Jackson 정렬 (FR-6/AC-8)**: `OpType`에 `@JsonValue`(→ `toWire()`)와 `@JsonCreator`(static `fromWire(String)`)를 추가해 JSON 직렬화/역직렬화도 wire로 정렬. @Convert의 JPA-only 비대칭을 닫아 Phase 2 SyncResponse(CrdtOp→JSON) 함정 예방. (사용자 확정)

## 변경 범위

### 신규 생성
- `backend/src/main/java/com/ieum/collaboration/OpTypeConverter.java` — `@Converter public class ... implements AttributeConverter<OpType,String>`.
- `backend/src/test/java/com/ieum/collaboration/OpTypeTest.java` — 순수 단위(AC-1/2/5/8, wire 집합 앵커 AC-6 보조).
- `backend/src/test/java/com/ieum/collaboration/OpTypeConverterTest.java` — 순수 단위(위임 스모크 + null + 미지값 예외; AC-5 read 경로).
- `backend/src/test/java/com/ieum/collaboration/CrdtOpPersistenceIntegrationTest.java` — Testcontainers 통합(AC-3/4).

### 수정
- `backend/src/main/java/com/ieum/collaboration/OpType.java` — enum 5종 + wireValue + toWire/fromWire + @JsonValue/@JsonCreator.
- `backend/src/main/java/com/ieum/collaboration/CrdtOp.java:45-47` — `@Enumerated(EnumType.STRING)` → `@Convert(converter = OpTypeConverter.class)`.
- `backend/src/main/java/com/ieum/collaboration/dto/WsMessages.java:32-33,39` — opType 주석 두 곳 wire 5종 정렬.
- `backend/src/test/java/com/ieum/workspace/WorkspaceDeleteLeaveIntegrationTest.java` — native SQL(라인 424-431) → JPA save, "JPA enum 우회" 주석 제거, jdbcTemplate 필드(라인 62) 제거.

### 불변
- V3 마이그레이션(제약 정본), V1, ws-relay, @ieum/crdt, 프론트, `OpService`(스텁), `CollaborationWebSocketHandler`(주석만 무관), `CrdtOpRepository`(시그니처).

## 인터페이스

**OpType** (`com.ieum.collaboration.OpType`)
```java
public enum OpType {
    INSERT("insert"), DELETE("delete"),
    BLOCK_INSERT("block-insert"), BLOCK_DELETE("block-delete"), BLOCK_SET_TYPE("block-set-type");

    private final String wireValue;
    OpType(String wireValue) { this.wireValue = wireValue; }

    @JsonValue
    public String toWire() { return wireValue; }

    @JsonCreator
    public static OpType fromWire(String wire) {
        for (OpType t : values()) if (t.wireValue.equals(wire)) return t;
        throw new IllegalArgumentException("알 수 없는 CRDT op_type wire 값: '" + wire + "'");
    }
}
```

**OpTypeConverter** (`com.ieum.collaboration.OpTypeConverter`)
```java
@Converter
public class OpTypeConverter implements AttributeConverter<OpType, String> {
    public String convertToDatabaseColumn(OpType a) { return a == null ? null : a.toWire(); }
    public OpType convertToEntityAttribute(String db) { return db == null ? null : OpType.fromWire(db); }
}
```

**CrdtOp** (라인 45-47)
```java
@Convert(converter = OpTypeConverter.class)
@Column(nullable = false)
private OpType opType;
```

**WsMessages.OpMessage** (라인 32-33 Javadoc + 라인 39 인라인)
```
// opType: "insert" | "delete" | "block-insert" | "block-delete" | "block-set-type" (wire opType, 소문자)
```

## 구현 순서 (RGR 태스크 + AC 매핑)
1. **[Must] OpType 확장 + 매핑 + Jackson** (의존 없음) — FR-1/BR-1/BR-3/FR-6. RED: `OpTypeTest`(5종 toWire/fromWire/왕복 AC-1·2, 미지값 IAE AC-5, Jackson ObjectMapper 왕복 + 미지값 예외 AC-8, values() 5종·wire 집합 앵커 AC-6 보조).
2. **[Must] OpTypeConverter** (의존 1) — FR-2/BR-2/BR-3. RED: `OpTypeConverterTest`(convertToDatabaseColumn/convertToEntityAttribute 위임 스모크 대표 1~2종 + 양방향 null 통과 + `convertToEntityAttribute("unknown-op")` IAE=AC-5 read 경로). 5종 완전성은 T1에 위임(중복 회피 — critic).
3. **[Must] CrdtOp @Enumerated→@Convert** (의존 2) — FR-2. RED+GREEN: `CrdtOpPersistenceIntegrationTest`(Testcontainers) — 5종 save 후 `JdbcTemplate` native SELECT로 op_type 원문=wire 소문자(AC-3), findById로 enum 복원(AC-4). **seq 유니크 제약(page_id,site_id,seq) 회피: seq 1..5 또는 siteId 분리**. FK 체인 픽스처(user→workspace→page) 선행.
4. **[Must] WsMessages 주석 정렬** (의존 없음) — FR-3/AC-6. 라인 32-33 + 39 두 곳 교체. review-gated + T1 앵커 보조.
5. **[Must] cascade 테스트 복원** (의존 3) — FR-5/AC-7. native SQL → `crdtOpRepository.save(CrdtOp.builder().pageId(pid).siteId("site-cascade").seq(1).opType(OpType.INSERT).payload("{}").build())`, 주석·jdbcTemplate 제거, 기존 assertion 보존.

1·4 독립(병렬 가능). 2←1, 3←2, 5←3.

## 테스트 전략
- **순수 단위(Docker 불필요)**: OpTypeTest(AC-1/2/5/8 + AC-6 앵커), OpTypeConverterTest(위임·null·미지값 AC-5 read 경로). 모의 0.
- **통합(Testcontainers)**: CrdtOpPersistenceIntegrationTest(AC-3/4) — `AbstractIntegrationTest` 확장, @BeforeEach FK 역순 deleteAll, 원문은 JdbcTemplate native SELECT(JPA 조회는 컨버터가 enum 재래핑해 원문 은닉). cascade 복원(AC-7)은 WorkspaceDeleteLeaveIntegrationTest.
- **AC-5 순수 강등 근거**: V3 CHECK가 미지 문자열 행 삽입을 물리적으로 거부 → "미지 행 read" 통합 셋업 불가. `convertToEntityAttribute`가 JPA read 매핑 경로 그 자체이므로 순수 단위가 등가·충실. FR-4는 AC-4(컨버터 read 배선 입증) + AC-5(미지값 throw) 조합으로 커버.
- **AC-6**: 문서 전용 → **review-gated**(자동 테스트 불가). T1의 wire 집합 앵커가 드리프트 보조 가드.

## 리스크 / 인계
- **결정6 원자성**: 컨버터(T3) 없이 cascade 복원(T5)만 반영되면 대문자 저장 → V3 위반. RGR 순서·단일 PR 유지로 해소.
- **Jackson/JPA 대칭**: 결정7로 양쪽 wire 정렬(AC-8 검증). 
- **3자 합동 미봉**: V3(5종) / Java OpType(5종) / @ieum/crdt AnyOp['type'](5종)를 잠그는 크로스 테스트는 없음(별 코드베이스). 향후 wire에 6번째 op 추가 시 relay 기록 행을 Java read가 IAE로 거부 — 이것이 FR-4의 미래 가치. 인계 메모로 남김.
- **런타임 실효**: 현재 실효는 결정6(정직한 테스트)뿐. 나머지는 Phase 2(Java read/write 활성화) 전 표현 드리프트 선제 상환.

## 비고 (범위 밖)
- OpService.handleOp save/broadcast 구현(Phase 2), CollaborationWebSocketHandler sync 구현, ws-relay/@ieum/crdt/프론트, 새 마이그레이션, block payload 로직, created_by_id(V4) 매핑, WsMessages 클래스 상단 payload Javadoc 전면 개정.

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략
- **OpType (순수)**: OpTypeTest — 5종 toWire/fromWire/왕복(AC-1/2), 미지값 IAE(AC-5), Jackson 왕복+미지값(AC-8), wire 집합 앵커(AC-6 보조). 모의 0, 완전 격리.
- **OpTypeConverter (순수)**: OpTypeConverterTest — POJO 직접 인스턴스화, 위임 스모크 + null + convertToEntityAttribute 미지값 IAE(AC-5 read 경로). 모의 0.
- **CrdtOp (통합)**: CrdtOpPersistenceIntegrationTest(Testcontainers) — 5종 save→JdbcTemplate native SELECT 원문 소문자(AC-3), findById enum 복원(AC-4). FK 체인 픽스처, @BeforeEach deleteAll, seq 유니크 회피.
- **WsMessages (review-gated)**: AC-6 문서 정렬은 인간 리뷰; T1 앵커 보조.
- **cascade (통합)**: WorkspaceDeleteLeaveIntegrationTest JPA 복원(AC-7), 기존 assertion 보존, WsRelayAdminClient는 @MockitoBean 재사용.

### Testability Score: 9/10
순수 enum + 얇은 컨버터 + 실 DB 통합 분리가 모범적. 강결합·전역상태·static 의존 없음. 감점 1: AC-6이 문서 전용이라 review-gated(AC 성격상 불가피).

### 판정
✅ **9 ≥ 7 → TESTABILITY PASS.** RGR 진입 가능. 반영: seq 유니크 회피(AC-3 fixture), AC-6 review-gated 명시, AC-3 원문 JdbcTemplate, OpTypeConverterTest 최소화, 결정6 원자성 순서, AC-5=AC-4+AC-5 조합 커버, Jackson 정렬(결정7/AC-8).
