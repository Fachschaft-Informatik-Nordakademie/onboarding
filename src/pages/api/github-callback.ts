export const prerender = false;

import type { APIRoute } from 'astro';

function parseCookie(header: string, name: string): string {
  return (
    header.split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  );
}

// Handles the GitHub OAuth callback.
// Verifies the CSRF state, exchanges the code for an access token, fetches the
// GitHub user, and stores the verified username in an HttpOnly cookie.
export const GET: APIRoute = async ({ url, request }) => {
  const code  = url.searchParams.get('code')  ?? '';
  const state = url.searchParams.get('state') ?? '';

  const cookieHeader = request.headers.get('cookie') ?? '';
  const storedState  = parseCookie(cookieHeader, 'gh_state');

  const secure     = url.protocol === 'https:' ? '; Secure' : '';
  const clearState = `gh_state=; HttpOnly; SameSite=Lax; Path=/api/github-callback; Max-Age=0${secure}`;

  function redirect(target: string, extraCookies: string[] = []): Response {
    const headers = new Headers({ Location: target });
    headers.append('Set-Cookie', clearState);
    for (const c of extraCookies) headers.append('Set-Cookie', c);
    return new Response(null, { status: 302, headers });
  }

  // CSRF check
  if (!code || !state || !storedState || state !== storedState) {
    return redirect('/?github=error&reason=state');
  }

  const clientId     = process.env.GITHUB_CLIENT_ID     ?? '';
  const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) {
    return redirect('/?github=error&reason=config');
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    if (!tokenRes.ok) return redirect('/?github=error&reason=token');
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token ?? '';
    if (!accessToken) return redirect('/?github=error&reason=token');
  } catch {
    return redirect('/?github=error&reason=token');
  }

  // Fetch GitHub user info
  let login: string;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'FSINF-Onboarding/1.0',
        Accept: 'application/vnd.github+json',
      },
    });
    if (!userRes.ok) return redirect('/?github=error&reason=user');
    const userData = await userRes.json();
    login = userData.login ?? '';
    if (!login) return redirect('/?github=error&reason=user');
  } catch {
    return redirect('/?github=error&reason=user');
  }

  console.log(`[github-oauth] Authenticated: ${login}`);

  // Store verified GitHub username in HttpOnly cookie (2 h)
  const ghUserCookie = `gh_user=${encodeURIComponent(login)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${secure}`;
  return redirect('/?github=connected', [ghUserCookie]);
};
