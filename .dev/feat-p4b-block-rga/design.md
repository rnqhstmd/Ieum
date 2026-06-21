# 설계: P4b — 2-level 블록 RGA (`@ieum/crdt`)

- 설계 규모: **중형** (신규 모듈 2 + 기존 1 제네릭화, 공개 API 확장)
- 권위 규격: `requirements/07-collaboration-crdt.md` §4-M, §8
- 결정: Q1=A (`inheritType`: heading1~3→paragraph, paragraph/bullet 유지, 커서 무관)

## 1. 설계 개요

기존 인라인 RGA 코어를 **제네릭 `<V>`로 확장**하여 외부 블록 RGA(`RgaState<BlockMeta>`)와 내부 인라인 RGA(`RgaState<string>`)가 **동일한 정렬·인과버퍼·멱등 머신을 공유**하게 한다(DRY, §8-3 "generic V 활용"). 블록 전용 의미론(LWW 타입, blockId 스코프 라우팅, 블록 미도착 인라인 버퍼링, split/merge, 도출)은 신규 `block.ts`에 둔다. op↔wire 직렬화는 신규 `wire.ts`.

핵심 원칙(§8-1) 유지: 순수 함수, 의존성 0, 사이드이펙트 없음.

## 2. 변경 범위

| 파일 | 변경 | 역할 |
|------|------|------|
| `packages/crdt/src/rga.ts` | **수정(제네릭화)** | `createRga<V=string>`, `applyOp<V>`, 내부 헬퍼(`insertNode/drainBuffer/nodeFromInsert/isCausallyReady/findNodeById/endOfSubtree`)를 `<V>`로 확장. 신규 generic `getVisibleNodes<V>`. `toText/serializeRga/deserializeRga/localInsert/localDelete`는 string 전용 유지 |
| `packages/crdt/src/block.ts` | **신규** | `DocState`, `createDocument`, `applyDocOp`, `docToBlocks`, `splitBlock`, `mergeBlockWithPrev`, `setBlockType`, `inheritType`, 로컬 인라인 헬퍼 |
| `packages/crdt/src/wire.ts` | **신규** | `WireEnvelope`, `toWire`, `fromWire` |
| `packages/crdt/src/index.ts` | **수정** | 신규 공개 API 재export |
| `packages/crdt/src/op.ts` | 유지 | `make*Op` 헬퍼·타입 가드 그대로 사용 |
| `packages/crdt/tests/block.test.ts` | **신규** | AC-1~14 |
| `packages/crdt/tests/wire.test.ts` | **신규** | AC-15 |

**백워드 호환**: `createRga<V = string>` 기본값이 string이라 기존 호출(`createRga('A')`)·기존 `rga.test.ts`는 무변경 통과. `RgaState`/`RgaOp` 별칭(=`<string>`)은 그대로.

## 3. DocState 구조

```typescript
interface DocState {
  siteId: string;
  localClock: number;                          // 로컬 op id 발급용 단조 클락 (블록·인라인 공용)
  blockRga: RgaState<BlockMeta>;               // 외부 블록 리스트 RGA
  inlineRgas: Map<string, RgaState<string>>;   // idKey(blockId) → 블록별 내부 인라인 RGA
  pendingInline: (InlineInsertOp | InlineDeleteOp)[]; // 블록 미도착 인라인 op 버퍼
  pendingSetType: BlockSetTypeOp[];            // 블록 미도착 set-type 버퍼
}
```

- 인라인 RGA **내부**의 문자 인과버퍼(`pendingBuffer`/`pendingDeletes`)는 각 `RgaState`가 자체 보유(P4 재사용).
- 문서 **레벨** 버퍼(`pendingInline`/`pendingSetType`)는 "대상 블록이 아직 도착 안 함" 케이스 전용 — 블록 도착 시 드레인.
- `BlockMeta = { type, typeClock, typeSiteId }`는 `RgaNode<BlockMeta>.value`. 블록 id/originId/deleted는 노드에.

## 4. op 적용 — `applyDocOp(doc, op: AnyOp): void`

op 종류로 분기. 모두 멱등.

```
block-insert:
  value: BlockMeta = { type: op.blockType, typeClock: 0, typeSiteId: '' }  // LWW baseline
  applyOp(doc.blockRga, { type:'insert', id:op.id, originId:op.originId, value })  // 제네릭, tie-break 정렬
  if (!inlineRgas.has(idKey(op.id))) inlineRgas.set(idKey(op.id), createRga(siteId))  // 멱등: 기존 RGA 보존
  drainPending(doc)   // 새 블록 도착 → 보류 인라인/set-type 재시도

block-delete:
  applyOp(doc.blockRga, { type:'delete', targetId: op.targetId })  // tombstone, 멱등
  // inlineRgas 항목은 보존(tombstone된 블록; 단순성·향후 replay 안전)

block-set-type:
  node = blockRga.nodeMap.get(idKey(op.blockId))
  if (!node) { pendingSetType.push(op); return }            // 인과 버퍼
  applyLww(node.value, op)                                  // 아래 LWW

inline-insert | inline-delete:
  inline = inlineRgas.get(idKey(op.blockId))
  if (!inline) { pendingInline.push(op); return }           // 블록 미도착 → 버퍼
  applyOp(inline, stripBlockId(op))                         // 제네릭 인라인 적용(블록 내부 인과·멱등)
```

### 4-1. LWW (block-set-type)

```
applyLww(meta: BlockMeta, op):
  win = op.clock > meta.typeClock
        || (op.clock === meta.typeClock && op.siteId > meta.typeSiteId)
  if (win) { meta.type = op.blockType; meta.typeClock = op.clock; meta.typeSiteId = op.siteId }
```

- **멱등**: 동일 op 재적용 시 `op.clock === typeClock && op.siteId === typeSiteId` → `>` 거짓 → 무변화.
- **교환·수렴**: 최종 상태 = 모든 set-type 중 `(clock, siteId)` 최대 = 적용 순서 무관(max는 결합·교환).
- baseline `typeClock=0`: clock≥1 set-type은 항상 baseline을 이김. (로컬 set-type은 `++localClock`으로 clock≥1)

### 4-2. 인과 드레인 — `drainPending(doc)`

블록 도착이 보류 op를 풀 수 있으므로 진행이 멈출 때까지 반복:

```
progress = true
while (progress):
  progress = false
  pendingInline = pendingInline.filter(op => {
    if (inlineRgas.has(idKey(op.blockId))) { applyOp(inline, stripBlockId(op)); progress = true; return false }
    return true
  })
  pendingSetType = pendingSetType.filter(op => {
    const node = blockRga.nodeMap.get(idKey(op.blockId))
    if (node) { applyLww(node.value, op); progress = true; return false }
    return true
  })
```

> 인라인 op가 블록에 라우팅된 뒤, 블록 내부의 문자 originId 인과버퍼는 인라인 RGA의 `applyOp`/`drainBuffer`가 자체 처리한다(2단 버퍼).

## 5. 로컬 편집 헬퍼

### 5-1. `inheritType(t: BlockType): BlockType` (Q1=A)
```
return (t === 'heading1' || t === 'heading2' || t === 'heading3') ? 'paragraph' : t
```

### 5-2. `splitBlock(doc, blockId, cursorIndex): AnyOp[]` (§4M-3)
1. `newBlockId = { counter: ++doc.localClock, siteId }`
2. `blockInsert = makeBlockInsertOp(newBlockId, blockId, inheritType(blockType(blockId)))`
3. `tail = getVisibleNodes(inlineRgas.get(blockId)).slice(cursorIndex)` — 커서 이후 가시 문자
4. `deleteOps = tail.map(n => makeInlineDeleteOp(n.id, blockId))`  // {type:'delete', targetId, blockId}
5. `insertOps`: tail을 새 블록에 originId 체인으로 재삽입 — 각 `{counter:++localClock, siteId}`, value=n.value, blockId=newBlockId, originId=직전 새 id(첫 항목 null)
6. ops = `[blockInsert, ...deleteOps, ...insertOps]`; 각 op를 `applyDocOp(doc, op)`로 **로컬 즉시 적용**; ops 반환(P5 broadcast용)

### 5-3. `mergeBlockWithPrev(doc, blockId): AnyOp[] | null` (§4M-4)
1. `prev = getPrevVisibleBlock(doc, blockId)`; 없으면 `return null`
2. `src = getVisibleNodes(inlineRgas.get(blockId))`
3. `prevId = lastVisibleNodeId(inlineRgas.get(prev.id))`  // prev 마지막 문자 id, 없으면 null
4. `insertOps`: src를 prev 블록 끝에 originId 체인 재삽입(blockId=prev.id, 새 id들)
5. `blockDelete = makeBlockDeleteOp(blockId)`
6. ops = `[...insertOps, blockDelete]`; 로컬 적용 후 반환. (src 인라인은 블록 tombstone과 함께 사라지므로 별도 inline-delete 불필요)

### 5-4. `setBlockType(doc, blockId, type): BlockSetTypeOp` (FR-13)
`op = makeBlockSetTypeOp(blockId, type, ++doc.localClock, doc.siteId)`; `applyDocOp(doc, op)`; 반환.

### 5-5. 보조 (block.ts 내부, 제네릭 `getVisibleNodes<V>` 활용)
- `getVisibleNodes<V>(rga): RgaNode<V>[]` — sentinel.next부터 `!deleted` 노드 순서대로 (rga.ts에 추가, 블록·인라인 공용)
- `getPrevVisibleBlock(doc, blockId)`: `getVisibleNodes(blockRga)`에서 blockId 직전 항목
- `lastVisibleNodeId(rga)`: `getVisibleNodes(rga).at(-1)?.id ?? null`

## 6. 도출 — `docToBlocks(doc): EditorBlockView[]`
```
type EditorBlockView = { id: RgaId; type: BlockType; text: string }
getVisibleNodes(blockRga).map(b => ({
  id: b.id,
  type: b.value.type,
  text: toText(inlineRgas.get(idKey(b.id)) ?? createRga(siteId)),  // 빈 블록 → ''
}))
```
- 외부 RGA 가시 순서·tombstone 제외 보장(`getVisibleNodes`).
- P3 `EditorBlock { id:string, type, text }`와 형태 정합(단 id는 `RgaId`; P5 배선 시 `idKey`로 string화).

## 7. Wire 봉투 — `wire.ts`
```typescript
interface WireEnvelope {
  siteId: string;
  seq: number;
  opType: 'block-insert' | 'block-delete' | 'block-set-type' | 'insert' | 'delete';
  payload: AnyOp;   // op 전체 (이미 JSON 안전한 평범한 객체)
}

toWire(op: AnyOp, seq: number, siteId?: string): WireEnvelope
  // siteId 우선순위: 명시 인자 > op.id.siteId(insert/block-insert) > op.siteId(set-type) > op.targetId.siteId(delete)
fromWire(env: WireEnvelope): AnyOp   // = env.payload
```
- 라운드트립 항등: `fromWire(toWire(op, seq))` 구조적 동일. `JSON.parse(JSON.stringify(env))`도 손실 없음(평범 객체).
- `seq`는 P5(relay/영속화)가 `(pageId, siteId, seq)` 유니크를 위해 발급 — codec은 보관만. siteId 인자 명시는 P5에서 sender 신원 기준(delete op가 sender site를 안 담으므로).

## 8. 공개 API 변경 (`index.ts` 추가 export)
```
export { createDocument, applyDocOp, docToBlocks, splitBlock, mergeBlockWithPrev, setBlockType, inheritType } from './block.js';
export { toWire, fromWire } from './wire.js';
export { getVisibleNodes } from './rga.js';
export type { DocState, EditorBlockView } from './block.js';
export type { WireEnvelope } from './wire.js';
```
(기존 인라인 RGA·op·타입 export 유지)

## 9. 구현 순서 (RGR 태스크 분해)

| 태스크 | AC | 산출 |
|--------|-----|------|
| T1 | (백compat) | `rga.ts` 제네릭화 `<V>` + `getVisibleNodes` — **기존 rga.test.ts 회귀 0** 확인 |
| T2 | AC-1,2 | `DocState`/`createDocument`/`docToBlocks` + 로컬 인라인 삽입 헬퍼 |
| T3 | AC-3,4,7 | `applyDocOp` block-insert/block-delete + 인라인 스코프 라우팅 |
| T4 | AC-5,6 | block-set-type LWW |
| T5 | AC-8,10,11 | `splitBlock`/`mergeBlockWithPrev`/`inheritType` |
| T6 | AC-9,12,13,14 | 수렴·인과버퍼·교환·멱등 (2-level, 시드 PRNG property) |
| T7 | AC-15 | `wire.ts` codec |

각 태스크 RED→GREEN→REFACTOR. T1은 회귀 방어(기존 테스트가 RED 가드).

## 10. 설계 자기비판 (design-critic 관점)

- **[CHALLENGE] 제네릭화가 기존 코드를 깨뜨리나?** → `<V = string>` 기본값으로 기존 시그니처 보존. 기존 `rga.test.ts`가 회귀 게이트(T1). 위험 낮음.
- **[CHALLENGE] sentinel value 생성** → 제네릭 sentinel은 `deleted:true`라 value를 절대 읽지 않음. `'' as unknown as V` 캐스트 1곳 국소화(주석 명시). 대안(value param)은 기존 API 깨짐 → 기각.
- **[SIMPLIFY] 문서 Snapshot 직렬화** → P4b 제외(P8). 2-level 직렬화는 재접속 replay 설계와 함께 가야 응집. 지금 만들면 미사용·재작업 위험 → 연기.
- **[SIMPLIFY] block-delete 시 inlineRgas 항목 제거?** → 제거하지 않음. tombstone 블록의 인라인 유지가 단순하고, 향후 op 재도착(늦은 인라인) 안전. 메모리는 MVP 비관심.
- **[ROOT-CAUSE] 2단 인과버퍼 필요성** → 인라인 op는 (a)블록 미도착, (b)블록 내 문자 originId 미도착 두 층의 인과 의존을 가짐. (a)는 doc 레벨 `pendingInline`, (b)는 인라인 RGA 자체 `pendingBuffer`가 처리. 둘을 분리해야 정확.

근본 문제 없음. MUST-ADDRESS 없음.

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략

#### rga.ts 제네릭화 (T1)
- 단위: 기존 `rga.test.ts` 전체 재실행(회귀 0). 신규 `getVisibleNodes`는 block.test에서 간접 + 직접 1건.
- 격리: 순수 함수, 의존성 없음. 모의 불필요.
- AC 매핑: (백compat 가드) — 모든 기존 AC.

#### block.ts — DocState/적용/도출 (T2~T4)
- 단위: `createDocument`→`docToBlocks` 직접 단언. `applyDocOp`에 수동 구성 op(`make*Op`) 주입 후 `docToBlocks` 결과 비교.
- 격리: siteId/counter를 테스트가 명시 → 완전 결정론적. 모의 대상 없음.
- AC 매핑: AC-1,2,3,4,5,6,7.

#### block.ts — split/merge (T5)
- 단위: 고정 텍스트 블록에서 `splitBlock`/`mergeBlockWithPrev` 호출 → 반환 op 배열 형태 + `docToBlocks` 결과 단언.
- AC 매핑: AC-8,10,11.

#### CRDT 4속성 2-level (T6)
- 단위+property: 두 replica(`replicaFromDoc`)에 op를 mulberry32 시드로 셔플 배분 → `docToBlocks` JSON 동일 단언(기존 rga.test.ts 패턴 재사용). 인과버퍼는 inline-before-block 순서 강제 케이스.
- 격리: 시드 PRNG로 무작위성 제거 → 재현 가능. 외부 의존성 0(fast-check 불필요, devDep 추가 없음).
- AC 매핑: AC-9,12,13,14.

#### wire.ts (T7)
- 단위: 각 op종류별 `fromWire(toWire(op,seq))` 구조 동일 + `JSON` 왕복.
- AC 매핑: AC-15.

### Testability Score: 9/10
- 순수 함수 + 결정론(시드 PRNG) + 의존성/모의 0 → RGR 사이클 완전 격리 가능.
- -1: 2-level 수렴 property 테스트의 op 생성기가 다소 복잡(블록·인라인 혼합 인과 유효 시퀀스 생성). 그러나 기존 단일 RGA 생성기 패턴 확장으로 해소 가능.

### 판정: ✅ TESTABILITY PASS (9/10 ≥ 7)
