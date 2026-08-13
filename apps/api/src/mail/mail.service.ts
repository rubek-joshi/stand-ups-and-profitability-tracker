import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";

export type SendMailPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>("SMTP_HOST");
    if (!host) {
      this.transporter = null;
      this.logger.warn("SMTP_HOST is not set; emails will be logged only");
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(this.configService.get<string>("SMTP_PORT") ?? 587),
      secure: false,
      auth: {
        user: this.configService.get<string>("SMTP_USER") ?? undefined,
        pass: this.configService.get<string>("SMTP_PASS") ?? undefined,
      },
    });
  }

  async sendMail(payload: SendMailPayload): Promise<void> {
    const from =
      this.configService.get<string>("SMTP_FROM") ?? "noreply@example.com";
    if (!this.transporter) {
      this.logger.log(
        `Mail skipped (no SMTP): to=${payload.to} subject=${payload.subject}`,
      );
      return;
    }
    await this.transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  }
}
