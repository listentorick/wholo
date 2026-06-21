import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private config: ConfigService) {
    const host = config.get<string>('SMTP_HOST', 'localhost');
    const port = config.get<number>('SMTP_PORT', 1025);
    const secure = config.get<string>('SMTP_SECURE', 'false') === 'true';
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    this.from = config.get<string>('SMTP_FROM', 'noreply@wholo.com.au');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {}),
    });
  }

  async sendInvite(to: string, distributorName: string, inviteUrl: string): Promise<void> {
    const subject = `${distributorName} has invited you to connect on Wholo`;
    const text = [
      `Hi,`,
      ``,
      `${distributorName} has invited you to connect with them on Wholo.`,
      ``,
      `Click the link below to accept and set up your account:`,
      `${inviteUrl}`,
      ``,
      `This link expires in 7 days.`,
      ``,
      `If you weren't expecting this invitation, you can safely ignore it.`,
    ].join('\n');

    const html = `
      <p>Hi,</p>
      <p><strong>${distributorName}</strong> has invited you to connect with them on Wholo.</p>
      <p>
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#D97036;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="color:#888;font-size:12px;">This link expires in 7 days. If you weren't expecting this, you can safely ignore it.</p>
    `.trim();

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      this.logger.log(`Invite email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send invite email to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }
}
