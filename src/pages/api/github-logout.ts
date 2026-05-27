export const prerender = false;

import type { APIRoute } from 'astro';

// Clears the gh_user session cookie and starts a fresh GitHub OAuth flow.
// The `prompt=select_account` param is not supported by GitHub, but clearing
// the server-side cookie ensures our app forgets the previous account even if
// GitHub auto-approves with the same one.
export const GET: APIRoute = async ({ url }) => {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const clearUser = `gh_user=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/api/github-auth',
      'Set-Cookie': clearUser,
    },
  });
};
