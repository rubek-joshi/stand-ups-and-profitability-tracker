import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";
import { CasbinService } from "../casbin/casbin.service";
import { PrismaService } from "../prisma/prisma.service";
import { MAIL_RECIPIENT_ROLES } from "../users/dto/user.dto";

export type SendMailPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

type ResolvedSmtp = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly casbinService: CasbinService,
  ) {}

  async sendMail(payload: SendMailPayload): Promise<void> {
    if (!(await this.canReceiveAutomatedMail(payload.to))) {
      this.logger.log(
        `Mail skipped (non-admin recipient): to=${payload.to} subject=${payload.subject}`,
      );
      return;
    }
    const smtp = await this.resolveSmtp();
    if (!smtp) {
      this.logger.log(
        `Mail skipped (no SMTP): to=${payload.to} subject=${payload.subject}`,
      );
      return;
    }
    const transporter = this.createTransport(smtp);
    await transporter.sendMail({
      from: smtp.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  }

  async sendTestMail(to: string): Promise<void> {
    const smtp = await this.resolveSmtp();
    if (!smtp) {
      throw new BadRequestException(
        "SMTP is not configured. Save host and from address first.",
      );
    }
    const transporter = this.createTransport(smtp);
    try {
      await transporter.sendMail({
        from: smtp.from,
        to,
        subject: "Tracker SMTP test",
        text: "This is a test email from Tracker. SMTP is working.",
        html: "<p>This is a test email from Tracker. SMTP is working.</p>",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send test email";
      throw new BadRequestException(message);
    }
  }

  private createTransport(smtp: ResolvedSmtp): Transporter {
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth:
        smtp.user || smtp.pass
          ? { user: smtp.user, pass: smtp.pass }
          : undefined,
    });
  }

  private async canReceiveAutomatedMail(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prismaService.user.findUnique({
      where: { email: normalized },
    });
    if (!user?.isActive) {
      return false;
    }
    const role = await this.casbinService.getPrimaryRoleForUser(user.id);
    return (
      role !== null &&
      (MAIL_RECIPIENT_ROLES as readonly string[]).includes(role)
    );
  }

  private async resolveSmtp(): Promise<ResolvedSmtp | null> {
    const settings = await this.prismaService.orgSettings.findFirst();
    const host =
      settings?.smtpHost?.trim() ||
      this.configService.get<string>("SMTP_HOST")?.trim() ||
      "";
    if (!host) return null;
    const from =
      settings?.smtpFrom?.trim() ||
      this.configService.get<string>("SMTP_FROM")?.trim() ||
      "noreply@example.com";
    const port =
      settings?.smtpPort ??
      Number(this.configService.get<string>("SMTP_PORT") ?? 587);
    const secure =
      settings?.smtpSecure ??
      this.configService.get<string>("SMTP_SECURE") === "true";
    const user =
      settings?.smtpUser?.trim() ||
      this.configService.get<string>("SMTP_USER")?.trim() ||
      undefined;
    const pass =
      settings?.smtpPass ||
      this.configService.get<string>("SMTP_PASS") ||
      undefined;
    return { host, port, secure, user, pass, from };
  }
}
