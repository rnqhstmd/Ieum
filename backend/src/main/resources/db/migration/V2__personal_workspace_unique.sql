-- 개인 워크스페이스는 사용자당 1개 (동시 중복생성 차단)
CREATE UNIQUE INDEX uq_workspaces_owner_personal
    ON workspaces (owner_id) WHERE type = 'PERSONAL';
