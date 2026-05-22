import nodemailer from 'nodemailer';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

const FROM = 'Fachschaft Informatik <noreply@nak-inf.org>';

export async function sendMail(opts: MailOptions): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[mailer] SMTP not configured — skipping mail to', opts.to);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  await transporter.sendMail({ from: FROM, ...opts });
}
