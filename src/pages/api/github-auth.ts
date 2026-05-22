export const prerender = false;

import type { APIRoute } from 'astro';

// Initiates GitHub OAuth flow.
// Generates a random CSRF state, stores it in a short-lived cookie, and
// redirects the user to GitHub's authorization page.
export const GET: APIRoute = async ({ url }) => {
  const clientId = process.env.GITHUB_CLIENT_ID ?? '';
  if (!clientId) {
    return new Response('GitHub OAuth nicht konfiguriert.', { status: 500 });
  }

  const state = crypto.randomUUID();
  const origin = process.env.SITE_URL ?? url.origin;
  const callbackUrl = new URL('/api/github-callback', origin).toString();

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('scope', 'read:user');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('redirect_uri', callbackUrl);

  // SameSite=Lax: GitHub sends the user back via a cross-site GET, so Strict
  // would prevent the state cookie from being included in that request.
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': `gh_state=${state}; HttpOnly; SameSite=Lax; Path=/api/github-callback; Max-Age=600${secure}`,
    },
  });
};
