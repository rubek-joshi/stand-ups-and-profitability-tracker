import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DiscoveryModule } from "@nestjs/core";
import { Rfc9457Module } from "@camcima/nestjs-rfc9457";
import { resolve } from "node:path";
import { AmcModule } from "./amc/amc.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CasbinModule } from "./casbin/casbin.module";
import { CategoriesModule } from "./categories/categories.module";
import { ClientsModule } from "./clients/clients.module";
import { CollabModule } from "./collab/collab.module";
import { CoreMembersModule } from "./core-members/core-members.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { EmployeesModule } from "./employees/employees.module";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { MailModule } from "./mail/mail.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProfitabilityModule } from "./profitability/profitability.module";
import { ProjectsModule } from "./projects/projects.module";
import { QueuesModule } from "./queues/queues.module";
import { SettingsModule } from "./settings/settings.module";
import { SnapshotsModule } from "./snapshots/snapshots.module";
import { StandupsModule } from "./standups/standups.module";
import { UsersModule } from "./users/users.module";
import { VatModule } from "./vat/vat.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, "../../../.env"),
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
    CoreMembersModule,
    StandupsModule,
    AmcModule,
    VatModule,
    DashboardModule,
    SnapshotsModule,
    JobsModule,
    CollabModule,
    HealthModule,
  ],
})
export class AppModule {}
