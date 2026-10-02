import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DiscoveryModule } from "@nestjs/core";
import { createObserveModule } from "@nestjs/observe";
import { Rfc9457Module } from "@camcima/nestjs-rfc9457";
import { resolve } from "node:path";
import { AmcModule } from "./amc/amc.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CasbinModule } from "./casbin/casbin.module.js";
import { CategoriesModule } from "./categories/categories.module.js";
import { ClientsModule } from "./clients/clients.module.js";
import { CollabModule } from "./collab/collab.module.js";
import { envSchema } from "./config/env.schema.js";
import { CoreMembersModule } from "./core-members/core-members.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { EmployeesModule } from "./employees/employees.module.js";
import { EmployeeGroupsModule } from "./employee-groups/employee-groups.module.js";
import { HealthModule } from "./health/health.module.js";
import { InvoicesModule } from "./invoices/invoices.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { MailModule } from "./mail/mail.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProfitabilityModule } from "./profitability/profitability.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { QueuesModule } from "./queues/queues.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { SnapshotsModule } from "./snapshots/snapshots.module.js";
import { StandupsModule } from "./standups/standups.module.js";
import { UsersModule } from "./users/users.module.js";
import { VatModule } from "./vat/vat.module.js";
import { WriteOffsModule } from "./write-offs/write-offs.module.js";

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY!,
      appSecret: process.env.OBSERVE_APP_SECRET!,
      serviceId: "tracker-production",
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(import.meta.dirname, "../../../.env"),
      validationSchema: envSchema,
    }),
    DiscoveryModule,
    Rfc9457Module.forRoot({
      suppress5xxDetail: true,
    }),
    PrismaModule,
    CasbinModule,
    UsersModule,
    AuthModule,
    MailModule,
    QueuesModule,
    AuditModule,
    SettingsModule,
    ProfitabilityModule,
    ClientsModule,
    CategoriesModule,
    ProjectsModule,
    EmployeesModule,
    EmployeeGroupsModule,
    CoreMembersModule,
    StandupsModule,
    AmcModule,
    VatModule,
    InvoicesModule,
    WriteOffsModule,
    DashboardModule,
    SnapshotsModule,
    JobsModule,
    CollabModule,
    HealthModule,
  ],
})
export class AppModule {}
