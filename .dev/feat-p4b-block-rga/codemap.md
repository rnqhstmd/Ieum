## 코드 맵: P4b 2-level 블록 RGA

### 핵심 파일
- packages/crdt/src/types.ts → BlockType/BlockMeta/BlockInsertOp/BlockDeleteOp/BlockSetTypeOp/InlineInsertOp/InlineDeleteOp/AnyOp 타입 **정의됨**, 적용 로직 없음 (P4b 대상)
- packages/crdt/src/op.ts → make*Op 스텁(객체만 생성, TODO) + 타입 가드(isBlockInsertOp 등) 구현됨
- packages/crdt/src/rga.ts → 인라인 문자 RGA 코어(createRga/applyOp/localInsert/localDelete/toText/serialize·deserialize). insertNode 순서/endOfSubtree/drainBuffer 로직 = 블록 RGA 재사용 후보
- packages/crdt/src/id.ts → compareIds(counter DESC, siteId 역순)/idKey/idEquals
- packages/crdt/src/index.ts → 공개 API 재export

### 참조 파일
- packages/crdt/tests/rga.test.ts → 기존 property-based 테스트 스타일(시드 PRNG 300회, 순열 검증)
- packages/crdt/tests/id.test.ts → id 단위 테스트 스타일
- apps/web/src/lib/editor/document.ts → P3 EditorBlock{id,type,text} 모델·splitBlock/mergeWithPrevious (블록 도출 형태 정합 참조)
- context/collaboration/status.md → US-CRDT-03 블록 op payload 정본 구조, P4b 잔여 범위 명시
- context/collaboration/architecture.md → CRDT 아키텍처(2-level RGA, wire 봉투)

### 설정
- packages/crdt/package.json → @ieum/crdt, type=module, main=src/index.ts, vitest run
- tsconfig.base.json → strict + noUncheckedIndexedAccess + verbatimModuleSyntax
