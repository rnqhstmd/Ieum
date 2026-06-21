## 배경

P4(PR #6)에서 인라인 문자 RGA 코어와 4속성(수렴·멱등·교환·인과버퍼)을 완성했다. 그러나 Ieum 에디터 문서는 블록(paragraph/heading1~3/bullet)의 시퀀스이므로 CRDT 모델링에 **2-level 블록 RGA**가 필요하다. `types.ts`에 블록/인라인 op 타입은 정의돼 있었으나 적용 로직이 없는 스텁 상태였다. P4b는 이 잔여를 채워 **CRDT 코어를 완성**한다.

P4b는 P5(WebSocket relay·op 영속화)의 직접 선행 조건이다.

## 변경 요약

- **DocState 2-level 구조**: 외부 블록 RGA(`RgaState<BlockMeta>`) + 블록별 내부 인라인 RGA(`Map<idKey, RgaState<string>>`).
- **rga.ts 제네릭화**: `createRga<V>`/`applyOp<V>` + `getVisibleNodes<V>`. 기본 `V=string`으로 **기존 인라인 RGA·테스트 100% 백워드 호환**.
- **applyDocOp**: block-insert(tie-break 정렬), block-delete(tombstone·멱등), block-set-type(LWW `(clock,siteId)` max), 인라인 `blockId` 스코프 라우팅.
- **2단 인과 버퍼링**: 블록 미도착 인라인/set-type(doc 레벨 `pendingInline`/`pendingSetType`) + 블록 내부 문자 originId(인라인 RGA 자체).
- **로컬 편집**: `splitBlock`(Enter)/`mergeBlockWithPrev`(Backspace)/`setBlockType`/`inheritType`(heading1~3→paragraph, 커서 무관).
- **도출/전송**: `docToBlocks`(렌더 소스), op↔wire 봉투 codec `toWire`/`fromWire` (`{siteId,seq,opType,payload}`).

## 테스트

- AC-1~15: `block.test.ts`(15) + `wire.test.ts`(4). 4속성(수렴·멱등·교환·인과버퍼) 2-level property 120회(시드 PRNG, 외부 의존성 0).
- `@ieum/crdt`: typecheck 0, **test 51/51**(기존 32 무회귀). `@ieum/web`: typecheck 0, **test 64/64**, `next build` green.

## Audit Summary
- 총 3건 (CRITICAL: 0, HIGH: 0, INFO: 3) — 순수 CRDT 패키지(의존성 0)로 전통적 보안 표면 없음.
- [INFO/USAGE] `toWire` delete op siteId 도출은 target(원작성자) 기준 → **P5 relay는 명시 sender siteId 전달 필수**.
- [INFO/DESIGN] block-set-type LWW는 사이트 로컬 카운터 기반(Lamport 아님) — 수렴 보장, 공정성은 P5 검토.
- [INFO/SEMANTICS] 동시 블록 분할 시 tail 텍스트 복제 — 표준 CRDT 의미론, 결정론적 수렴.

## 범위 밖 (후속)
문서 Snapshot 직렬화→P8, relay/CrdtOp 영속화→P5, 블록 reorder→P5+, 인라인 서식→v2, 프론트 에디터 배선→P5.
