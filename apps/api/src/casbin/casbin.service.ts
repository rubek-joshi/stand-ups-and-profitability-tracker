import { Injectable, OnModuleInit } from "@nestjs/common";
import { Enforcer, newEnforcer } from "casbin";
import { PrismaAdapter } from "casbin-prisma-adapter";
import { join } from "node:path";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CasbinService implements OnModuleInit {
  private enforcer!: Enforcer;

  constructor(private readonly prismaService: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const adapter = await PrismaAdapter.newAdapter(this.prismaService);
    const modelPath = join(__dirname, "model.conf");
    this.enforcer = await newEnforcer(modelPath, adapter);
    await this.enforcer.loadPolicy();
  }

  async enforce(subject: string, object: string, action: string): Promise<boolean> {
    return this.enforcer.enforce(subject, object, action);
  }

  getEnforcer(): Enforcer {
    return this.enforcer;
  }

  subjectForUser(userId: string): string {
    return `user:${userId}`;
  }

  async getRolesForUser(userId: string): Promise<string[]> {
    return this.enforcer.getRolesForUser(this.subjectForUser(userId));
  }

  async getPrimaryRoleForUser(userId: string): Promise<string | null> {
    const roles = await this.getRolesForUser(userId);
    return roles[0] ?? null;
  }

  async setRoleForUser(userId: string, role: string): Promise<void> {
    const subject = this.subjectForUser(userId);
    const current = await this.enforcer.getRolesForUser(subject);
    for (const existing of current) {
      await this.enforcer.deleteRoleForUser(subject, existing);
    }
    await this.enforcer.addRoleForUser(subject, role);
  }

  async getRoleMap(userIds: string[]): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    await Promise.all(
      userIds.map(async (id) => {
        map.set(id, await this.getPrimaryRoleForUser(id));
      }),
    );
    return map;
  }
}
