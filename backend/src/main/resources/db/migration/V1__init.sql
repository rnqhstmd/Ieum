-- ============================================================
-- V1__init.sql  —  이음(Ieum) 초기 스키마
-- Flyway 소유: ddl-auto=validate, 앱은 스키마를 건드리지 않는다.
-- ============================================================

-- ----------------------------------------------------------
-- 1. users
-- ----------------------------------------------------------
CREATE TABLE users (
    id          uuid        PRIMARY KEY,
    email       varchar     NOT NULL UNIQUE,
    name        varchar     NOT NULL,
    image       varchar,
    google_id   varchar     UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 2. workspaces
-- ----------------------------------------------------------
CREATE TABLE workspaces (
    id         uuid        PRIMARY KEY,
    name       varchar     NOT NULL,
    type       varchar     NOT NULL CHECK (type IN ('PERSONAL', 'SHARED')),
    owner_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 3. memberships
-- ----------------------------------------------------------
CREATE TABLE memberships (
    id           uuid        PRIMARY KEY,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    workspace_id uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    role         varchar     NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
    joined_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_memberships_user_workspace UNIQUE (user_id, workspace_id)
);

-- ----------------------------------------------------------
-- 4. invitations
-- ----------------------------------------------------------
CREATE TABLE invitations (
    id             uuid        PRIMARY KEY,
    workspace_id   uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    email          varchar     NOT NULL,
    invited_by_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role           varchar     NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
    token          varchar     NOT NULL UNIQUE,
    status         varchar     NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
    expires_at     timestamptz NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 5. pages
-- ----------------------------------------------------------
CREATE TABLE pages (
    id             uuid        PRIMARY KEY,
    workspace_id   uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    parent_page_id uuid        REFERENCES pages (id) ON DELETE SET NULL,
    title          varchar     NOT NULL,
    icon           varchar,
    position       int         NOT NULL DEFAULT 0,
    created_by_id  uuid        NOT NULL REFERENCES users (id),
    archived_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 활성 페이지 탐색 + 정렬용
CREATE INDEX idx_pages_workspace_parent_position
    ON pages (workspace_id, parent_page_id, position);

-- 아카이브 필터용
CREATE INDEX idx_pages_archived_at
    ON pages (archived_at);

-- ----------------------------------------------------------
-- 6. crdt_ops
-- ----------------------------------------------------------
CREATE TABLE crdt_ops (
    id         uuid        PRIMARY KEY,
    page_id    uuid        NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
    site_id    varchar     NOT NULL,
    seq        int         NOT NULL,
    server_seq bigint      GENERATED ALWAYS AS IDENTITY,
    op_type    varchar     NOT NULL CHECK (op_type IN ('INSERT', 'DELETE')),
    payload    jsonb       NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_crdt_ops_page_site_seq UNIQUE (page_id, site_id, seq)
);

-- 실시간 동기화: 특정 페이지의 server_seq 이후 연산 빠른 조회
CREATE INDEX idx_crdt_ops_page_server_seq
    ON crdt_ops (page_id, server_seq);

-- ----------------------------------------------------------
-- 7. snapshots
-- ----------------------------------------------------------
CREATE TABLE snapshots (
    id         uuid        PRIMARY KEY,
    page_id    uuid        NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
    state      jsonb       NOT NULL,
    version    bigint      NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 최신 스냅샷 조회용
CREATE INDEX idx_snapshots_page_version
    ON snapshots (page_id, version DESC);
