import { describe, it, expect } from 'vitest';
import { BASE } from './helpers';

const POST = (body: object) =>
  fetch(`${BASE}/api/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const PUT = (body: object, cookies = '') =>
  fetch(`${BASE}/api/verify-email`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) },
    body: JSON.stringify(body),
  });

describe('verify-email API', () => {
  describe('POST — send verification code', () => {
    it('rejects non-NAK email (gmail)', async () => {
      const res = await POST({ email: 'test@gmail.com' });
      expect(res.status).toBe(422);
      const body = await res.json() as { message: string };
      expect(body.message).toContain('nordakademie.de');
    });

    it('rejects empty email', async () => {
      const res = await POST({ email: '' });
      expect(res.status).toBe(422);
    });

    it('rejects missing email field', async () => {
      const res = await POST({});
      expect(res.status).toBe(422);
    });

    it('rejects email longer than 100 chars', async () => {
      const res = await POST({ email: 'a'.repeat(90) + '@nordakademie.de' });
      expect(res.status).toBe(422);
    });

    it('rejects invalid JSON body', async () => {
      const res = await fetch(`${BASE}/api/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json!!!',
      });
      expect(res.status).toBe(400);
    });

    it('rejects @nordakademie.de prefix forgery (nak.nordakademie.de)', async () => {
      const res = await POST({ email: 'user@nak.nordakademie.de.evil.com' });
      expect(res.status).toBe(422);
    });

    it('accepts valid NAK email format → 200', async () => {
      // Uses real SMTP — only run when TEST_NAK_EMAIL is set
      const testEmail = process.env.TEST_NAK_EMAIL;
      if (!testEmail) return;
      const res = await POST({ email: testEmail });
      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toBeTruthy();
    });
  });

  describe('PUT — verify code', () => {
    it('rejects missing code field → 400', async () => {
      const res = await PUT({ email: 'test@nordakademie.de' });
      expect(res.status).toBe(400);
    });

    it('rejects missing email field → 400', async () => {
      const res = await PUT({ code: '123456' });
      expect(res.status).toBe(400);
    });

    it('rejects code longer than 6 chars → 400', async () => {
      const res = await PUT({ email: 'test@nordakademie.de', code: '1234567' });
      expect(res.status).toBe(400);
    });

    it('rejects when no code was requested → 422', async () => {
      const uniqueEmail = `nocode-${Date.now()}@nordakademie.de`;
      const res = await PUT({ email: uniqueEmail, code: '123456' });
      expect(res.status).toBe(422);
      const body = await res.json() as { message: string };
      expect(body.message).toContain('Code');
    });

    it('rejects invalid JSON → 400', async () => {
      const res = await fetch(`${BASE}/api/verify-email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Rate limiting', () => {
    it('returns 429 after 3 code requests within 15 min', async () => {
      // Use a unique email per test run to avoid cross-test contamination
      const email = `ratelimit-${Date.now()}@nordakademie.de`;
      // First 3 should pass (or fail SMTP — we don't care about SMTP here, just rate limit)
      for (let i = 0; i < 3; i++) {
        await POST({ email });
      }
      const res = await POST({ email });
      expect(res.status).toBe(429);
      const body = await res.json() as { message: string };
      expect(body.message).toContain('warte');
    });
  });
});
