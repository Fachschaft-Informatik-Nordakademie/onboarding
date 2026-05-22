import { describe, it, expect } from 'vitest';
import { BASE } from './helpers';

const CLIENT_ID = 'Ov23liNQBl2KxbbzwJOc';

describe('GitHub OAuth flow', () => {
  describe('GET /api/github-auth', () => {
    it('redirects to GitHub authorize endpoint', async () => {
      const res = await fetch(`${BASE}/api/github-auth`, { redirect: 'manual' });
      expect(res.status).toBe(302);
      const loc = res.headers.get('location') ?? '';
      expect(loc).toContain('github.com/login/oauth/authorize');
    });

    it('includes correct client_id', async () => {
      const res = await fetch(`${BASE}/api/github-auth`, { redirect: 'manual' });
      expect(res.headers.get('location') ?? '').toContain(`client_id=${CLIENT_ID}`);
    });

    it('callback URL points to onboard.nak-inf.de', async () => {
      const res = await fetch(`${BASE}/api/github-auth`, { redirect: 'manual' });
      const loc = res.headers.get('location') ?? '';
      expect(decodeURIComponent(loc)).toContain('onboard.nak-inf.de/api/github-callback');
    });

    it('requests read:user scope', async () => {
      const res = await fetch(`${BASE}/api/github-auth`, { redirect: 'manual' });
      const loc = res.headers.get('location') ?? '';
      expect(decodeURIComponent(loc)).toContain('scope=read:user');
    });

    it('sets gh_state CSRF cookie (HttpOnly, SameSite=Lax)', async () => {
      const res = await fetch(`${BASE}/api/github-auth`, { redirect: 'manual' });
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('gh_state=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Secure');
    });

    it('generates a unique CSRF state per request', async () => {
      const [r1, r2] = await Promise.all([
        fetch(`${BASE}/api/github-auth`, { redirect: 'manual' }),
        fetch(`${BASE}/api/github-auth`, { redirect: 'manual' }),
      ]);
      const state1 = new URL(r1.headers.get('location')!).searchParams.get('state');
      const state2 = new URL(r2.headers.get('location')!).searchParams.get('state');
      expect(state1).toBeTruthy();
      expect(state2).toBeTruthy();
      expect(state1).not.toBe(state2);
    });
  });

  describe('GET /api/github-callback', () => {
    it('redirects to error when no state/code provided', async () => {
      const res = await fetch(`${BASE}/api/github-callback`, { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('location') ?? '').toContain('github=error');
    });

    it('redirects to reason=state when CSRF state mismatch', async () => {
      const res = await fetch(`${BASE}/api/github-callback?code=fakecode&state=wrongstate`, {
        redirect: 'manual',
        headers: { Cookie: 'gh_state=differentstate' },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('location') ?? '').toContain('reason=state');
    });

    it('clears gh_state cookie on every callback visit', async () => {
      const res = await fetch(`${BASE}/api/github-callback`, { redirect: 'manual' });
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('gh_state=');
      expect(setCookie).toContain('Max-Age=0');
    });
  });

  describe('GET /api/github-me', () => {
    it('returns { login: null } with no cookie', async () => {
      const res = await fetch(`${BASE}/api/github-me`);
      expect(res.status).toBe(200);
      const body = await res.json() as { login: string | null };
      expect(body.login).toBeNull();
    });

    it('returns username from gh_user cookie', async () => {
      const res = await fetch(`${BASE}/api/github-me`, {
        headers: { Cookie: 'gh_user=Raindancer118' },
      });
      const body = await res.json() as { login: string };
      expect(body.login).toBe('Raindancer118');
    });

    it('decodes URL-encoded username from cookie', async () => {
      const res = await fetch(`${BASE}/api/github-me`, {
        headers: { Cookie: 'gh_user=some-user-name' },
      });
      const body = await res.json() as { login: string };
      expect(body.login).toBe('some-user-name');
    });
  });
});
