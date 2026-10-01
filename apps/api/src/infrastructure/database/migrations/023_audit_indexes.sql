-- Audit UI refinement: the Administration Audit filters already supported
-- target_type/target_id equality (Administration phase), but neither column
-- had an index — verified by inspecting 002_admin_auth_rbac.sql, which only
-- indexes actor_admin_id/created_at/action. audit_logs is explicitly called
-- out as a table that can grow large, and this slice's combinable filters
-- (e.g. "Resource = SECURITY_CASE" + "Target ID = ...") make these two
-- columns genuinely load-bearing now, so the gap is fixed here.
--
-- No trigram/GIN index is added for the new free-text `search` parameter:
-- action and target_type are a bounded, small vocabulary of known constants
-- (not real free text), so a plain btree plus the other combinable filters
-- keeps a search query's effective scan small without new index
-- infrastructure. Actor email/full_name search already reuses the trigram
-- indexes 022_search_indexes.sql added on admin_users.
CREATE INDEX idx_audit_logs_target_type ON audit_logs (target_type);
CREATE INDEX idx_audit_logs_target_id ON audit_logs (target_id);
