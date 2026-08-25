-- Allow admins to read audit logs (super_admin already has this via seed / *).
INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'admin', 'audit', 'read'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'admin' AND "v1" = 'audit' AND "v2" = 'read'
);
