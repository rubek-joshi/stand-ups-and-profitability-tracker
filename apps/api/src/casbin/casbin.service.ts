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
}
