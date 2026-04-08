-- ============================================================
-- ERP System — Row-Level Security Policies
-- Run AFTER `prisma migrate deploy` creates the tables.
-- ============================================================

-- ─── Enable RLS on all tenant-scoped tables ──────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── Force RLS even for table owner ──────────────────────────

ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- ─── Tenant isolation policies ───────────────────────────────

-- Users: only see users in the current tenant
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Roles: see system roles (tenant_id IS NULL) AND current tenant's roles
DROP POLICY IF EXISTS tenant_isolation_roles ON roles;
CREATE POLICY tenant_isolation_roles ON roles
  USING (
    tenant_id IS NULL OR
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Permissions: globally readable (no tenant_id column)
DROP POLICY IF EXISTS allow_all_read_permissions ON permissions;
CREATE POLICY allow_all_read_permissions ON permissions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS allow_all_write_permissions ON permissions;
CREATE POLICY allow_all_write_permissions ON permissions
  FOR ALL USING (true);

-- Role Permissions: accessible if the role is accessible
DROP POLICY IF EXISTS tenant_isolation_role_permissions ON role_permissions;
CREATE POLICY tenant_isolation_role_permissions ON role_permissions
  USING (
    role_id IN (
      SELECT id FROM roles
      WHERE tenant_id IS NULL
         OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- User Roles: accessible if the user is in the current tenant
DROP POLICY IF EXISTS tenant_isolation_user_roles ON user_roles;
CREATE POLICY tenant_isolation_user_roles ON user_roles
  USING (
    user_id IN (
      SELECT id FROM users
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- Refresh Tokens: only see tokens for the current tenant
DROP POLICY IF EXISTS tenant_isolation_refresh_tokens ON refresh_tokens;
CREATE POLICY tenant_isolation_refresh_tokens ON refresh_tokens
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Audit Logs: only see logs for the current tenant
DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;
CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─── Audit Log Immutability Trigger ──────────────────────────

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable: UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- ─── Helper: Set tenant context for RLS ──────────────────────

CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Done. RLS policies are active.
-- ============================================================
