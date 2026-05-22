import { describe, it, expect } from 'vitest';
import { BASE } from './helpers';

describe('Smoke — Availability & Infrastructure', () => {
  it('main page returns 200 with HTML', async () => {
    const res = await fetch(BASE);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('Fachschaft');
  });

  it('HTTP redirects to HTTPS (301)', async () => {
    const httpUrl = BASE.replace('https://', 'http://');
    const res = await fetch(httpUrl, { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location') ?? '').toContain('https://');
  });

  it('onboard.nak-inf.org redirects 301 to onboard.nak-inf.de', async () => {
    const res = await fetch('https://onboard.nak-inf.org', { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location') ?? '').toContain('onboard.nak-inf.de');
  });

  it('SSL certificate is trusted (no fetch error)', async () => {
    const res = await fetch(BASE);
    expect(res.status).toBeLessThan(500);
  });

  it('security headers are present', async () => {
    const res = await fetch(BASE);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
    expect(res.headers.get('referrer-policy')).toBeTruthy();
  });

  it('_test-setup endpoint is hidden without correct backdoor', async () => {
    const res = await fetch(`${BASE}/api/_test-setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backdoor: 'wrong', email: 'x@y.de', ghUser: 'x' }),
    });
    expect([403, 404]).toContain(res.status);
  });

  it('_test-smtp endpoint is hidden without correct backdoor', async () => {
    const res = await fetch(`${BASE}/api/_test-smtp?backdoor=wrong`);
    expect([403, 404]).toContain(res.status);
  });

  it('logos asset is served', async () => {
    const res = await fetch(`${BASE}/logos/FSINF_dark_long.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('svg');
  });

  it('favicon is served', async () => {
    const res = await fetch(`${BASE}/favicon.svg`);
    expect(res.status).toBe(200);
  });

  it('response time is under 3 s', async () => {
    const start = Date.now();
    await fetch(BASE);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});
