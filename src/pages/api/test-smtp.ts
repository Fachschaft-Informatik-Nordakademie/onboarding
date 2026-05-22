export const prerender = false;
import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';

export const GET: APIRoute = async ({ url }) => {
  const backdoor = process.env.TEST_BACKDOOR ?? '';
  if (backdoor.length < 16) return new Response('Not Found', { status: 404 });
  if ((url.searchParams.get('backdoor') ?? '') !== backdoor)
    return new Response('Forbidden', { status: 403 });

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return json({ ok: false, error: 'SMTP not configured' });
  }

  const transporter = nodemailer.createTransport({ host, port: 587, secure: false, auth: { user, pass } });
  try {
    await transporter.verify();
    return json({ ok: true, host, user });
  } catch (err: unknown) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

function json(body: object) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
