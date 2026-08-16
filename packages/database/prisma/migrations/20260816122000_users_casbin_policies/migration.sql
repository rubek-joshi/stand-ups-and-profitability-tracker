-- Ensure users resource policies exist for admin / super_admin
INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'admin', 'users', '*'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'admin' AND "v1" = 'users' AND "v2" = '*'
);

INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'super_admin', 'users', '*'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'super_admin' AND "v1" = 'users' AND "v2" = '*'
);
