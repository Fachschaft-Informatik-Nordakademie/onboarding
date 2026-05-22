export const prerender = false;

import type { APIRoute } from 'astro';
import { verifiedTokens } from '../../lib/verifiedEmails';
import { sendMail } from '../../lib/mailer';

const LAN_PARTY_TEAM_SLUG = 'lan-party';
const LAN_PARTY_DISCORD = 'https://discord.gg/a7e9Uva5vH';
const VORSTAND_EMAIL = 'fachschaft-inf-vorstand@nordakademie.de';

export const POST: APIRoute = async ({ request, url }) => {
  const testMode = url.searchParams.get("mode") === "test";
  const dryRun = testMode && url.searchParams.get("dryRun") === "true";

  let fullName: string;
  let zenturie: string;
  let email: string;
  let heardFrom: string;
  let interests: string[];

  try {
    const body = await request.json();
    fullName  = body?.fullName?.trim() ?? '';
    zenturie  = body?.zenturie?.trim() ?? '';
    email     = body?.email?.trim() ?? '';
    heardFrom = body?.heardFrom?.trim() ?? '';
    interests = Array.isArray(body?.interests) ? body.interests : [];
  } catch {
    return json({ message: 'Ungültige Anfrage.' }, 400);
  }

  if (!fullName || fullName.length > 100) return json({ message: 'Bitte gib deinen Namen an (max. 100 Zeichen).' }, 422);
  if (!zenturie || zenturie.length > 50)  return json({ message: 'Bitte gib deine Zenturie an (max. 50 Zeichen).' }, 422);
  if (heardFrom.length > 50)              heardFrom = '';
  interests = interests.filter(i => typeof i === 'string' && i.length <= 50).slice(0, 20);
  if (!email || !email.endsWith('@nordakademie.de')) {
    return json({ message: 'Bitte gib eine gültige NAK-E-Mail-Adresse an (z.B. 20066@nordakademie.de).' }, 422);
  }

  const cookieHeader = request.headers.get('cookie') ?? '';

  const evToken = cookieHeader.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('ev_token='))
    ?.slice('ev_token='.length) ?? '';

  const tokenEntry = evToken ? verifiedTokens.get(evToken) : undefined;
  if (!tokenEntry || tokenEntry.email !== email || Date.now() > tokenEntry.expires) {
    return json({ message: 'Diese E-Mail-Adresse wurde noch nicht verifiziert. Bitte gehe zurück und bestätige zuerst deine NAK-E-Mail.' }, 403);
  }

  const ghUserRaw = cookieHeader.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('gh_user='))
    ?.slice('gh_user='.length) ?? '';
  const username = ghUserRaw ? decodeURIComponent(ghUserRaw) : '';

  if (!username || !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$|^[a-zA-Z0-9]$/.test(username)) {
    return json({ message: 'Bitte verbinde zuerst deinen GitHub-Account über den Button auf dieser Seite.' }, 403);
  }

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : fullName;
  const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  const token = process.env.GITHUB_TOKEN;
  const org   = process.env.GITHUB_ORG;

  if (!token || !org) {
    return json({ message: 'GitHub-Integration nicht konfiguriert. Bitte wende dich an einen Admin.' }, 500);
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: ghHeaders,
  });

  if (userRes.status === 404) return json({ message: `GitHub-Nutzer "${username}" nicht gefunden.` }, 422);
  if (!userRes.ok)            return json({ message: 'Fehler beim Abrufen des GitHub-Profils.' }, 500);

  const user = await userRes.json();

  const inviteRes = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/invitations`, {
    method: 'POST',
    headers: ghHeaders,
    body: JSON.stringify({ invitee_id: user.id, role: 'direct_member' }),
  });

  if (!inviteRes.ok) {
    const errorBody = await inviteRes.json().catch(() => ({}));
    if (inviteRes.status === 422) {
      const msg: string = errorBody?.errors?.[0]?.message ?? '';
      if (msg.toLowerCase().includes('already')) {
        if (!testMode) {
          return json({ message: `@${username} ist bereits Mitglied oder wurde bereits eingeladen.` }, 422);
        }
      } else {
        return json({ message: msg || 'Ungültige Anfrage an GitHub.' }, 422);
      }
    } else {
      return json({ message: 'GitHub-Einladung fehlgeschlagen. Bitte wende dich an einen Admin.' }, 500);
    }
  }

  const wantsLan = interests.includes('lan-party');
  if (wantsLan) {
    await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(org)}/teams/${LAN_PARTY_TEAM_SLUG}/memberships/${encodeURIComponent(username)}`,
      { method: 'PUT', headers: ghHeaders }
    ).catch(() => {});
  }

  const interestLabels: Record<string, string> = {
    'lan-party': 'LAN-Party', 'marketing': 'Marketing', 'brettspiele': 'Brettspiele',
    'minecraft': 'Minecraft Server', 'sponsoring': 'Sponsoring Relations',
    'discord': 'Discord', 'reddit': 'Reddit', 'merch': 'Merch',
  };
  const heardFromLabels: Record<string, string> = {
    'event': 'Event', 'peer': 'Andere Studis', 'dozenten': 'Dozenten',
    'social-media': 'Social Media', 'info-event': 'Info-Veranstaltung',
    'webauftritt': 'Webauftritt', 'memes': 'Memes',
  };
  const interestList   = interests.map(i => interestLabels[i] ?? i).join(', ') || '-';
  const heardFromLabel = (heardFromLabels[heardFrom] ?? heardFrom) || '-';

  if (!dryRun) await Promise.all([
    sendMail({
      to: email,
      subject: 'Willkommen bei der Fachschaft Informatik! 🎉',
      html: confirmationHtml(firstName, username, wantsLan),
    }),
    sendMail({
      to: VORSTAND_EMAIL,
      subject: `Neues Mitglied: ${fullName} (${zenturie})`,
      html: notificationHtml({ fullName, firstName, lastName, zenturie, email, username, heardFromLabel, interestList, wantsLan }),
    }),
  ]);

  const secure = url.protocol === 'https:' ? '; Secure' : '';
  verifiedTokens.delete(evToken);

  console.log(`[onboarding${testMode ? ':test' : ''}] ${new Date().toISOString()} | ${fullName} | ${zenturie} | ${email} | @${username} | heard: ${heardFrom} | interests: ${interests.join(',')}`);

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `ev_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
  headers.append('Set-Cookie', `gh_user=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);

  return new Response(
    JSON.stringify({
      message: `Einladung an @${username} gesendet! Schau in dein E-Mail-Postfach und nimm die GitHub-Einladung an.`,
      lanPartyInvite: wantsLan ? LAN_PARTY_DISCORD : null,
    }),
    { status: 200, headers },
  );
};

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function emailShell(content: string) {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fachschaft Informatik</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#111c32;border-radius:16px 16px 0 0;padding:32px;text-align:center">
          <img src="https://onboard.nak-inf.de/logos/FSINF_dark_long.svg"
               alt="Fachschaft Informatik" width="220"
               style="display:block;margin:0 auto;max-width:220px" />
        </td></tr>
        <tr><td style="background:linear-gradient(90deg,#003a79,#3cd2ff);height:4px"></td></tr>
        <tr><td style="background:#ffffff;padding:40px 36px;border-radius:0 0 16px 16px">
          ${content}
        </td></tr>
        <tr><td style="padding:24px;text-align:center">
          <p style="margin:0;font-size:12px;color:#888">
            Fachschaft Informatik · Nordakademie<br>
            <a href="https://nak-inf.de" style="color:#003a79;text-decoration:none">nak-inf.de</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function confirmationHtml(firstName: string, username: string, wantsLan: boolean) {
  const safeFirst    = esc(firstName);
  const safeUsername = esc(username);
  return emailShell(`
    <h1 style="margin:0 0 8px;font-size:26px;color:#111c32">Hey ${safeFirst}! 🎉</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6">
      Willkommen bei der <strong style="color:#003a79">Fachschaft Informatik</strong>!
      Schön, dass du dabei bist – deine Anmeldung war erfolgreich.
    </p>

    <h2 style="margin:0 0 16px;font-size:16px;color:#003a79;text-transform:uppercase;letter-spacing:.5px">Was passiert als nächstes?</h2>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 16px;background:#f8f9fb;border-radius:10px;margin-bottom:8px;display:block">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:36px;font-size:22px;vertical-align:top">🐙</td>
              <td style="vertical-align:top;padding-left:12px">
                <strong style="color:#111c32;font-size:14px">GitHub-Einladung annehmen</strong><br>
                <span style="color:#666;font-size:13px">Du bekommst eine Einladung an die E-Mail deines GitHub-Accounts (<strong>@${safeUsername}</strong>). Bitte annehmen!</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="height:8px"></td></tr>
      ${wantsLan ? `<tr>
        <td style="padding:12px 16px;background:#f0f4ff;border-radius:10px;border:1px solid #c7d2fe">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:36px;font-size:22px;vertical-align:top">🎮</td>
              <td style="vertical-align:top;padding-left:12px">
                <strong style="color:#111c32;font-size:14px">LAN-Party-AG: Discord beitreten</strong><br>
                <span style="color:#666;font-size:13px">Da du dich für die LAN-Party-AG interessierst:</span><br>
                <a href="${LAN_PARTY_DISCORD}" style="display:inline-block;margin-top:8px;padding:6px 14px;background:#5865f2;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">LAN-Orga Discord →</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="height:8px"></td></tr>` : ''}
      <tr>
        <td style="padding:12px 16px;background:#f8f9fb;border-radius:10px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:36px;font-size:22px;vertical-align:top">📱</td>
              <td style="vertical-align:top;padding-left:12px">
                <strong style="color:#111c32;font-size:14px">Meld dich in der WhatsApp-Gruppe</strong><br>
                <span style="color:#666;font-size:13px">Bei Fragen stehen wir dir dort jederzeit zur Verfügung.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
    <p style="margin:0;font-size:14px;color:#555">
      Bis bald,<br>
      <strong style="color:#111c32">Tom &amp; Eric</strong><br>
      <span style="color:#888;font-size:13px">Vorstand Fachschaft Informatik</span>
    </p>
  `);
}

function notificationHtml(d: {
  fullName: string; firstName: string; lastName: string; zenturie: string;
  email: string; username: string; heardFromLabel: string; interestList: string; wantsLan: boolean;
}) {
  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;width:130px;vertical-align:top">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#111c32;vertical-align:top">${value}</td>
    </tr>`;

  return emailShell(`
    <div style="display:inline-block;padding:4px 12px;background:#e8f4fd;border-radius:20px;font-size:12px;font-weight:600;color:#003a79;margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px">
      Neues Mitglied
    </div>
    <h1 style="margin:0 0 6px;font-size:24px;color:#111c32">${esc(d.fullName)}</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#888">${esc(d.zenturie)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f0f0">
      ${row('E-Mail', `<a href="mailto:${esc(d.email)}" style="color:#003a79;text-decoration:none">${esc(d.email)}</a>`)}
      ${row('GitHub', `<a href="https://github.com/${esc(d.username)}" style="color:#003a79;text-decoration:none">@${esc(d.username)}</a>`)}
      ${row('Wie erfahren', esc(d.heardFromLabel))}
      ${row('Interessen', esc(d.interestList))}
      ${d.wantsLan ? row('LAN-Party', '✅ GitHub-Team + Discord-Invite') : ''}
    </table>
  `);
}
