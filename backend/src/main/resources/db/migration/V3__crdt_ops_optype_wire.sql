-- ----------------------------------------------------------
-- V3: crdt_ops.op_type CHECK를 CRDT wire opType(소문자 5종)으로 확장
-- ----------------------------------------------------------
-- 배경: @ieum/crdt WireEnvelope.opType은 AnyOp['type']로 5종이다 —
--   insert / delete / block-insert / block-delete / block-set-type
-- (인라인·블록 insert/delete는 'insert'/'delete'를 공유). V1의 CHECK는
-- ('INSERT','DELETE') 2종만 허용해 블록 op·set-type을 저장할 수 없었다.
-- Node ws-relay(정본 영속화)가 wire opType을 봉투 충실하게 저장하도록 확장한다.
-- crdt_ops는 P5 후반 영속화 도입 전까지 비어 있어 데이터 마이그레이션은 불필요하다.

-- V1의 컬럼 인라인 CHECK는 Postgres 자동명 규칙(<table>_<column>_check)을 따른다.
ALTER TABLE crdt_ops DROP CONSTRAINT crdt_ops_op_type_check;

ALTER TABLE crdt_ops ADD CONSTRAINT crdt_ops_op_type_check
    CHECK (op_type IN ('insert', 'delete', 'block-insert', 'block-delete', 'block-set-type'));
