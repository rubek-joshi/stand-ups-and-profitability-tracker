import { config } from "dotenv";
import { resolve } from "node:path";
import * as bcrypt from "bcrypt";

config({ path: resolve(__dirname, "../../../.env") });

import { prisma } from "../src/client";

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
    update: {
      name,
      passwordHash,
      isActive: true,
    },
    create: {
      email,
      name,
      passwordHash,
      isActive: true,
    },
  });

  const rolePolicies = [
    { ptype: "p", v0: "super_admin", v1: "*", v2: "*" },
    { ptype: "p", v0: "admin", v1: "*", v2: "*" },
    { ptype: "p", v0: "manager", v1: "projects", v2: "read" },
    { ptype: "p", v0: "manager", v1: "standups", v2: "*" },
  ];

  for (const policy of rolePolicies) {
    const existing = await prisma.casbinRule.findFirst({
      where: {
        ptype: policy.ptype,
        v0: policy.v0,
        v1: policy.v1,
        v2: policy.v2,
      },
    });
    if (!existing) {
      await prisma.casbinRule.create({ data: policy });
    }
  }

  const subject = `user:${user.id}`;
  const membership = await prisma.casbinRule.findFirst({
    where: {
      ptype: "g",
      v0: subject,
      v1: "super_admin",
    },
  });
  if (!membership) {
    await prisma.casbinRule.create({
      data: {
        ptype: "g",
        v0: subject,
        v1: "super_admin",
      },
    });
  }

  console.log(`Seeded super admin: ${user.email} (${user.id})`);
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
