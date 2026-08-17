DELETE FROM casbin_rule WHERE ptype = 'p' AND v0 = 'admin' AND v1 = 'amc' AND v2 = '*';
INSERT INTO casbin_rule (ptype, v0, v1, v2)
SELECT 'p', 'admin', 'amc', 'read'
WHERE NOT EXISTS (
  SELECT 1 FROM casbin_rule WHERE ptype = 'p' AND v0 = 'admin' AND v1 = 'amc' AND v2 = 'read'
);
INSERT INTO casbin_rule (ptype, v0, v1, v2)
SELECT 'p', 'admin', 'amc', 'write'
WHERE NOT EXISTS (
  SELECT 1 FROM casbin_rule WHERE ptype = 'p' AND v0 = 'admin' AND v1 = 'amc' AND v2 = 'write'
);