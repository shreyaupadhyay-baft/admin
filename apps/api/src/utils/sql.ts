// Escapes LIKE/ILIKE special characters so a literal '%' or '_' typed by an
// admin is matched literally, not interpreted as a wildcard. Every pattern
// built from this must be used with `ILIKE ... ESCAPE '\'`. Shared between
// Global Search and the Administration Audit search/filter query — both do
// parameterized, escaped substring matching over free-text columns.
export const escapeLikeSpecials = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
