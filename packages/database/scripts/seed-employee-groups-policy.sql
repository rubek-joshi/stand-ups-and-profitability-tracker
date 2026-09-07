INSERT INTO casbin_rule (ptype, v0, v1, v2)
SELECT 'p', 'admin', 'employee-groups', '*'
WHERE NOT EXISTS (SELECT 1 FROM casbin_rule WHERE ptype='p' AND v0='admin' AND v1='employee-groups' AND v2='*');
