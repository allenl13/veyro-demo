import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:4173';
for (const route of ['/research', '/portfolio']) {
  const response = await fetch(`${origin}${route}`);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-type')?.includes('text/html'));
  const csp = response.headers.get('content-security-policy');
  assert.ok(csp?.includes("connect-src 'self'") && csp.includes("object-src 'none'"));
  const html = await response.text();
  assert.ok(html.includes('Veyro · Synthetic Demo') && html.includes('id="root"'));
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    const asset = await fetch(`${origin}${match[1]}`);
    assert.equal(asset.status, 200);
    assert.ok((await asset.arrayBuffer()).byteLength > 0);
  }
}
for (const icon of ['/favicon.svg', '/favicon.ico']) {
  const response = await fetch(`${origin}${icon}`);
  assert.equal(response.status, 200, `Missing local icon: ${icon}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 0);
  if (icon.endsWith('.ico')) assert.deepEqual([...bytes.slice(0, 6)], [0, 0, 1, 0, 1, 0], 'Invalid ICO header');
}
console.log('Local HTTP smoke check passed: research/portfolio SPA, production assets, SVG/ICO icons and same-origin CSP. Browser interaction coverage is recorded separately.');
