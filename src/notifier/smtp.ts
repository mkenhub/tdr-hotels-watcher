import nodemailer from 'nodemailer';
import type { Config } from '../config/schema.js';
import { SMTP_PRESETS, type SmtpProvider } from '../config/presets.js';
import { formatDateTime } from '../renderer/helpers.js';

export type NotifyOptions = {
  htmlBody: string;
  fetchedAt: Date;
  smtpPassword: string;
  /** 詳細HTMLレポートを添付ファイルとして同梱する場合 */
  attachment?: { filename: string; content: string };
};

export async function sendMail(config: Config, opts: NotifyOptions): Promise<void> {
  const conn = resolveSmtpConnection(config);
  const transporter = nodemailer.createTransport({
    host: conn.host,
    port: conn.port,
    secure: conn.secure,
    auth: {
      user: config.smtp.from,
      pass: opts.smtpPassword,
    },
  });

  const subject = renderSubject(config.smtp.subject_template, opts.fetchedAt);

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.smtp.to.join(', '),
    subject,
    html: opts.htmlBody,
    ...(opts.attachment
      ? {
          attachments: [
            {
              filename: opts.attachment.filename,
              content: opts.attachment.content,
              contentType: 'text/html; charset=utf-8',
            },
          ],
        }
      : {}),
  });
}

function resolveSmtpConnection(config: Config): { host: string; port: number; secure: boolean } {
  const provider = config.smtp.provider as SmtpProvider;
  if (provider === 'other') {
    if (!config.smtp.host || !config.smtp.port || config.smtp.secure === undefined) {
      throw new Error(
        'provider: other のときは smtp.host / smtp.port / smtp.secure を config.yaml に指定してください',
      );
    }
    return { host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure };
  }
  return SMTP_PRESETS[provider];
}

function renderSubject(template: string, fetchedAt: Date): string {
  const dt = formatDateTime(fetchedAt);
  const [date, time] = dt.split(' ');
  return template
    .replace(/\{\{date\}\}/g, date ?? dt)
    .replace(/\{\{time\}\}/g, time ?? '');
}
