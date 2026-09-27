-- Adds per-user permission overrides without deleting or resetting existing data.
-- Safe to run once on an existing Nexus PostgreSQL database.

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT user_permissions_pkey PRIMARY KEY (user_id, permission_id),
    CONSTRAINT user_permissions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT user_permissions_permission_id_fkey
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_permissions_permission_id_idx
    ON user_permissions(permission_id);
