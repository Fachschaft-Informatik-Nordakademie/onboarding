export const prerender = false;
import type { APIRoute } from 'astro';
import { verifiedTokens } from '../../lib/verifiedEmails';

export const POST: APIRoute = async ({ request, url }) => {
  const backdoor = process.env.TEST_BACKDOOR ?? '';
  if (backdoor.length < 16) return new Response('Not Found', { status: 404 });

  let reqBackdoor: string, email: string, ghUser: string;
  try {
    const body = await request.json();
    reqBackdoor = body?.backdoor ?? '';
    email       = body?.email?.trim() ?? '';
    ghUser      = body?.ghUser?.trim() ?? '';
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  if (reqBackdoor !== backdoor)  return new Response('Forbidden', { status: 403 });
  if (!email || !ghUser)         return new Response('Bad Request', { status: 400 });

  const token = crypto.randomUUID();
  verifiedTokens.set(token, { email, expires: Date.now() + 5 * 60 * 1000 });

  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `ev_token=${token}; HttpOnly; SameSite=Strict; Path=/${secure}; Max-Age=300`);
  headers.append('Set-Cookie', `gh_user=${encodeURIComponent(ghUser)}; HttpOnly; SameSite=Strict; Path=/${secure}; Max-Age=300`);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
