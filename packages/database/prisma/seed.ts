import { config } from "dotenv";
import { resolve } from "node:path";
import * as bcrypt from "bcrypt";

config({ path: resolve(__dirname, "../../../.env") });

import { prisma } from "../src/client";

async function upsertPolicy(
  ptype: string,
  v0: string,
  v1: string,
  v2: string,
): Promise<void> {
  const existing = await prisma.casbinRule.findFirst({
    where: { ptype, v0, v1, v2 },
  });
  if (!existing) {
    await prisma.casbinRule.create({ data: { ptype, v0, v1, v2 } });
  }
}

async function seed(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? "Super Admin";

  if (!email || !password) {
    throw new Error(
      "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in the root .env",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, isActive: true },
    create: { email, name, passwordHash, isActive: true },
  });

  await prisma.orgSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      vatRatePercent: 13,
      paidLeaveDaysPerMonth: 4,
      amcReminderLeadDays: 7,
      healthHealthyMinPercent: 20,
      healthAtRiskMinPercent: 0,
    },
  });

  for (const categoryName of ["Design", "Development"]) {
    await prisma.category.upsert({
      where: { name: categoryName },
      update: { isSeeded: true, isActive: true },
      create: { name: categoryName, isSeeded: true, isActive: true },
    });
  }

  const policies: Array<[string, string, string]> = [
    ["super_admin", "*", "*"],
    ["super_admin", "audit", "read"],
    ["super_admin", "settings", "*"],
    ["super_admin", "snapshots", "*"],
    ["admin", "clients", "*"],
    ["admin", "categories", "*"],
    ["admin", "projects", "*"],
    ["admin", "employees", "*"],
    ["admin", "employee-groups", "*"],
    ["admin", "core-members", "*"],
    ["admin", "standups", "*"],
    ["admin", "amc", "read"],
    ["admin", "amc", "write"],
    ["admin", "vat", "*"],
    ["admin", "invoices", "*"],
    ["admin", "users", "*"],
    ["admin", "dashboard", "read"],
    ["admin", "settings", "read"],
    ["admin", "settings", "health"],
    ["admin", "audit", "read"],
    ["super_admin", "users", "*"],
    ["manager", "projects", "read"],
    ["manager", "standups", "*"],
    ["manager", "dashboard", "read"],
    ["manager", "employees", "read"],
    ["manager", "employee-groups", "read"],
    ["manager", "core-members", "read"],
    ["manager", "clients", "read"],
    ["manager", "invoices", "read"],
    ["standup_taker", "standups", "*"],
    ["standup_taker", "projects", "read"],
    ["standup_taker", "employees", "read"],
    ["standup_taker", "employee-groups", "read"],
  ];

  for (const [role, obj, act] of policies) {
    await upsertPolicy("p", role, obj, act);
  }

  // Narrow AMC writes: admins keep write/read, hard-delete is super_admin-only via Casbin *.
  await prisma.casbinRule.deleteMany({
    where: { ptype: "p", v0: "admin", v1: "amc", v2: "*" },
  });

  const subject = `user:${user.id}`;
  const membership = await prisma.casbinRule.findFirst({
    where: { ptype: "g", v0: subject, v1: "super_admin" },
  });
  if (!membership) {
    await prisma.casbinRule.create({
      data: { ptype: "g", v0: subject, v1: "super_admin" },
    });
  }

  console.log(`Seeded super admin: ${user.email} (${user.id})`);
  console.log("Seeded OrgSettings, categories, and Casbin policies");
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
