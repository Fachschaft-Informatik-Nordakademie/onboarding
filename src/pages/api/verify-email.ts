export const prerender = false;

import type { APIRoute } from 'astro';
import { verifiedTokens } from '../../lib/verifiedEmails';
import { sendMail } from '../../lib/mailer';

// In-memory store – persists for the lifetime of the Node.js process
const pendingCodes   = new Map<string, { code: string; expires: number; attempts: number }>();
// Rate-limit: track how many code requests per email within the current 15-min window
const codeRequests   = new Map<string, { count: number; windowStart: number }>();

const CODE_TTL       = 15 * 60 * 1000;  // 15 min
const RATE_WINDOW    = 15 * 60 * 1000;  // 15 min
const MAX_SENDS      = 3;               // max code-sends per email per window
const MAX_ATTEMPTS   = 5;               // max wrong guesses before code is invalidated

/** Purge expired entries from all maps to prevent unbounded memory growth. */
function purgeExpired(): void {
  const now = Date.now();
  for (const [k, v] of pendingCodes)  { if (now > v.expires) pendingCodes.delete(k); }
  for (const [k, v] of codeRequests)  { if (now - v.windowStart > RATE_WINDOW) codeRequests.delete(k); }
  for (const [k, v] of verifiedTokens){ if (now > v.expires)  verifiedTokens.delete(k); }
}
// Run cleanup every 30 minutes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(setInterval(purgeExpired, 30 * 60 * 1000) as any).unref?.();

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emailHtml(code: string) {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bestätigungscode</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#111c32;border-radius:16px 16px 0 0;padding:32px;text-align:center">
          <img src="https://onboarding.nak-inf.de/logos/FSINF_dark_long.svg" alt="Fachschaft Informatik" width="220" style="display:block;margin:0 auto;max-width:220px"/>
        </td></tr>
        <tr><td style="background:linear-gradient(90deg,#003a79,#3cd2ff);height:4px"></td></tr>
        <tr><td style="background:#ffffff;padding:40px 36px;border-radius:0 0 16px 16px">
          <h1 style="margin:0 0 8px;font-size:24px;color:#111c32">Dein Bestätigungscode</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.6">
            Gib diesen Code im Onboarding-Wizard ein, um deine NAK-E-Mail-Adresse zu bestätigen.
          </p>
          <div style="text-align:center;margin:0 0 28px">
            <span style="display:inline-block;padding:20px 40px;background:#f0f4ff;border:2px solid #003a79;border-radius:12px;font-size:36px;font-weight:700;letter-spacing:8px;color:#003a79;font-family:monospace">${code}</span>
          </div>
          <p style="margin:0;font-size:13px;color:#888">Dieser Code ist 15 Minuten gültig. Wenn du diesen Code nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
          <p style="margin:0;font-size:14px;color:#555">Bis bald,<br><strong style="color:#111c32">Tom &amp; Eric</strong><br><span style="color:#888;font-size:13px">Vorstand Fachschaft Informatik</span></p>
        </td></tr>
        <tr><td style="padding:24px;text-align:center">
          <p style="margin:0;font-size:12px;color:#888">Fachschaft Informatik · Nordakademie<br><a href="https://nak-inf.de" style="color:#003a79;text-decoration:none">nak-inf.de</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// POST – send verification code
export const POST: APIRoute = async ({ request }) => {
  let email: string;
  try {
    const body = await request.json();
    email = body?.email?.trim() ?? '';
  } catch {
    return json({ message: 'Ungültige Anfrage.' }, 400);
  }

  if (!email || email.length > 100 || !email.endsWith('@nordakademie.de')) {
    return json({ message: 'Bitte gib eine gültige NAK-E-Mail-Adresse an (z.B. 20066@nordakademie.de).' }, 422);
  }

  // Rate-limit: max MAX_SENDS code requests per email per RATE_WINDOW
  const now = Date.now();
  const rateEntry = codeRequests.get(email) ?? { count: 0, windowStart: now };
  if (now - rateEntry.windowStart > RATE_WINDOW) {
    rateEntry.count = 0;
    rateEntry.windowStart = now;
  }
  if (rateEntry.count >= MAX_SENDS) {
    return json({ message: 'Zu viele Code-Anfragen. Bitte warte 15 Minuten und versuche es erneut.' }, 429);
  }
  rateEntry.count++;
  codeRequests.set(email, rateEntry);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  pendingCodes.set(email, { code, expires: now + CODE_TTL, attempts: 0 });

  try {
    await sendMail({
      to: email,
      subject: `${code} ist dein Bestätigungscode - Fachschaft Informatik`,
      html: emailHtml(code),
    });
  } catch (err) {
    console.error('[verify-email] SMTP error:', err);
    return json({ message: 'E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.' }, 500);
  }

  console.log(`[verify-email] Code sent to ${email}`);
  return json({ message: 'Code gesendet! Schau in dein Postfach (und Spam-Ordner).' }, 200);
};

// PUT – verify code
export const PUT: APIRoute = async ({ request, url }) => {
  let email: string;
  let code: string;
  try {
    const body = await request.json();
    email = body?.email?.trim() ?? '';
    code = body?.code?.trim() ?? '';
  } catch {
    return json({ message: 'Ungültige Anfrage.' }, 400);
  }

  if (!email || email.length > 100 || !code || code.length > 6) {
    return json({ message: 'Ungültige Anfrage.' }, 400);
  }

  const entry = pendingCodes.get(email);
  if (!entry) {
    return json({ message: 'Kein Code für diese Adresse angefordert. Bitte erst den Code anfordern.' }, 422);
  }
  if (Date.now() > entry.expires) {
    pendingCodes.delete(email);
    return json({ message: 'Der Code ist abgelaufen. Bitte fordere einen neuen an.' }, 422);
  }
  if (entry.code !== code) {
    entry.attempts++;
    if (entry.attempts >= MAX_ATTEMPTS) {
      pendingCodes.delete(email);
      return json({ message: 'Zu viele Fehlversuche. Bitte fordere einen neuen Code an.' }, 429);
    }
    return json({ message: `Falscher Code. Bitte überprüfe deine Eingabe. (${MAX_ATTEMPTS - entry.attempts} Versuche verbleibend)` }, 422);
  }

  pendingCodes.delete(email);

  // Issue a per-device token stored as an HttpOnly cookie
  const token = crypto.randomUUID();
  verifiedTokens.set(token, { email, expires: Date.now() + 2 * 60 * 60 * 1000 }); // 2 h

  const secure = url.protocol === 'https:' ? '; Secure' : '';
  console.log(`[verify-email] Verified: ${email}`);
  return new Response(
    JSON.stringify({
      verified: true,
      whatsappInvite: process.env.WHATSAPP_INVITE ?? null,
      discordInvite:  process.env.DISCORD_INVITE  ?? null,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `ev_token=${token}; HttpOnly; SameSite=Strict; Path=/${secure}; Max-Age=7200`,
      },
    },
  );
};
