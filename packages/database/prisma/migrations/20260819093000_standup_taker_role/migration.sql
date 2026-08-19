-- Stand-up taker: sign in and work stand-ups (plus supporting reads the UI needs).
INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'standup_taker', 'standups', '*'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'standup_taker' AND "v1" = 'standups' AND "v2" = '*'
);

INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'standup_taker', 'projects', 'read'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'standup_taker' AND "v1" = 'projects' AND "v2" = 'read'
);

INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'standup_taker', 'employees', 'read'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'standup_taker' AND "v1" = 'employees' AND "v2" = 'read'
);

INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'standup_taker', 'employee-groups', 'read'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'standup_taker' AND "v1" = 'employee-groups' AND "v2" = 'read'
);
