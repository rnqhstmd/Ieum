-- ----------------------------------------------------------
-- V4: crdt_ops.created_by_id — op를 영속한 인증 사용자 태깅 (WS-AUTH-03)
-- ----------------------------------------------------------
-- 서버는 WS 연결의 인증 userId(웹이 /api/users/me로 얻어 join에 trust-relay)를 op에
-- 태깅한다. siteId(세션 UUID)는 신원 비교에 쓰지 않는다(08-auth §4-2). 기존 행과
-- userId 없는 경로(InMemoryOpStore)는 NULL을 허용한다.
ALTER TABLE crdt_ops ADD COLUMN created_by_id uuid REFERENCES users (id);
