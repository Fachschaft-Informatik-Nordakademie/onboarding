export const prerender = false;

import type { APIRoute } from 'astro';

// Returns the OAuth-verified GitHub username from the HttpOnly cookie.
// Used by the wizard JS to check connection status without exposing the cookie to JS.
export const GET: APIRoute = async ({ request }) => {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const raw = cookieHeader.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('gh_user='))
    ?.slice('gh_user='.length) ?? '';

  const login = raw ? decodeURIComponent(raw) : null;

  return new Response(JSON.stringify({ login }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
