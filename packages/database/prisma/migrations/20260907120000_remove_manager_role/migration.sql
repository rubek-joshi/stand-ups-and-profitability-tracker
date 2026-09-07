-- Reassign users with the manager role to admin, then drop manager policies.
UPDATE "casbin_rule"
SET "v1" = 'admin'
WHERE "ptype" = 'g' AND "v1" = 'manager';

DELETE FROM "casbin_rule"
WHERE "ptype" = 'p' AND "v0" = 'manager';
