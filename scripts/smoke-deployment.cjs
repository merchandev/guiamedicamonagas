// Run inside this project's API container after deployment, with the two
// SEED_SUPERADMIN_* variables supplied by name. Never prints credentials.
// Creates one temporary professional and removes only that account and its photo.
// Session checks (password change, tokenVersion) run on that temporary account
// only: the real administrator's sessions are never revoked.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { ConfigService } = require('@nestjs/config');
const { StorageService } = require('/app/dist/src/storage/storage.service');
const { scanWithClamav } = require('/app/dist/src/uploads/clamav.scanner');
const sharp = require('sharp');

assert.equal(new URL(process.env.DATABASE_URL).pathname, '/gmm_independent');
assert.equal(process.env.SMTP_HOST, 'mailpit', 'Registration test requires this project\'s mail catcher');
assert.ok(process.env.SEED_SUPERADMIN_EMAIL && process.env.SEED_SUPERADMIN_PASSWORD);
const base = process.env.FRONTEND_URL;
const email = `deployment-${randomUUID()}@example.invalid`;
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });
const storage = new StorageService(new ConfigService({ ...process.env, S3_FORCE_PATH_STYLE: true }));
const results = [];
const initialPassword = `Gmm9-${randomUUID()}`;
let mailId;

async function request(path, { method = 'GET', body, token, cookie } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined && !form ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: form ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { response, data };
}

function ok(result, label) {
  assert.ok(result.response.ok, `${label}: HTTP ${result.response.status}`);
  results.push(label);
  console.log(`PASS ${label}`);
  return result.data;
}

async function main() {
  for (const path of ['/', '/iniciar-sesion', '/planes', '/farmacias', '/api/v1/health']) {
    ok(await request(path), `GET ${path}`);
  }
  const specialties = ok(await request('/api/v1/specialties'), 'Specialties catalog');
  assert.ok(Array.isArray(specialties) && specialties.length > 0);
  const plans = ok(await request('/api/v1/subscriptions/plans'), 'Plans catalog');
  assert.ok(Array.isArray(plans) && plans.length > 0);

  const admin = await request('/api/v1/auth/login', {
    method: 'POST', body: { email: process.env.SEED_SUPERADMIN_EMAIL, password: process.env.SEED_SUPERADMIN_PASSWORD },
  });
  const adminData = ok(admin, 'Administrator login');
  const setCookie = admin.response.headers.get('set-cookie');
  assert.match(setCookie, /^gmm_refresh_token=/);
  assert.match(setCookie, /httponly/i);
  // Con HTTPS (dominio propio) la cookie debe ser "secure"; por HTTP simple, no.
  if (process.env.COOKIE_SECURE === 'true') assert.match(setCookie, /;\s*secure/i);
  else assert.doesNotMatch(setCookie, /;\s*secure/i);
  const me = ok(await request('/api/v1/auth/me', { token: adminData.accessToken }), 'Administrator identity');
  assert.equal(me.role, 'SUPERADMIN');
  const refreshed = await request('/api/v1/auth/refresh', { method: 'POST', cookie: setCookie.split(';')[0] });
  assert.ok(ok(refreshed, 'Session refresh').accessToken);
  const newCookie = refreshed.response.headers.get('set-cookie').split(';')[0];
  ok(await request('/api/v1/auth/logout', { method: 'POST', cookie: newCookie }), 'Session logout');
  const revoked = await request('/api/v1/auth/refresh', { method: 'POST', cookie: newCookie });
  assert.ok(revoked.response.status === 401 || !revoked.data.accessToken, 'Logged-out refresh must fail');
  console.log('PASS Logged-out refresh rejected');

  const registered = ok(await request('/api/v1/auth/register', {
    method: 'POST',
    body: { email, password: initialPassword, role: 'PROFESSIONAL', firstName: 'Prueba', lastName: 'Despliegue', acceptLegal: true },
  }), 'Temporary professional registration');
  const token = registered.accessToken;
  assert.ok(token);
  const messagesResponse = await fetch('http://mailpit:8025/api/v1/messages', { signal: AbortSignal.timeout(10000) });
  assert.ok(messagesResponse.ok);
  const messages = await messagesResponse.json();
  const mail = messages.messages.find(m => m.To?.some(to => to.Address === email));
  assert.ok(mail, 'Verification mail must arrive in this project\'s Mailpit');
  mailId = mail.ID;
  console.log('PASS Verification email captured');
  const detail = await (await fetch(`http://mailpit:8025/api/v1/message/${mailId}`)).json();
  const match = (detail.HTML || detail.Text || '').match(/verificar-correo\?token=([a-f0-9]+)/);
  assert.ok(match, 'Verification link must contain a token');
  ok(await request(`/api/v1/auth/verify-email?token=${match[1]}`), 'Email verification');

  // PNG válido generado aquí mismo: la API verifica y re-codifica cada imagen,
  // y un PNG con CRC dañado se rechaza (422) como corresponde.
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#0f6e5c' } }).png().toBuffer();
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'deployment-test.png');
  const photo = ok(await request('/api/v1/professionals/me/photo', { method: 'POST', body: form, token }), 'Private photo upload');
  assert.ok(photo.photoUrl);
  assert.equal(new URL(photo.photoUrl).origin, new URL(base).origin);
  const download = await fetch(photo.photoUrl, { signal: AbortSignal.timeout(10000) });
  assert.equal(download.status, 200, 'Signed photo download');
  // Las imágenes se re-codifican al subirse (sin metadatos): se comprueba que
  // siga siendo un PNG, no que los bytes sean idénticos.
  assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 4).toString('hex'), '89504e47');
  console.log('PASS Signed photo download (re-encoded PNG)');
  const unsigned = new URL(photo.photoUrl);
  unsigned.search = '';
  const denied = await fetch(unsigned, { signal: AbortSignal.timeout(10000) });
  assert.equal(denied.status, 403, 'Anonymous object access must be denied');
  console.log('PASS Anonymous photo access denied');

  const changed = ok(await request('/api/v1/auth/change-password', {
    method: 'POST', token, body: { currentPassword: initialPassword, newPassword: `Gmm9-${randomUUID()}` },
  }), 'Password change renews this session');
  const stale = await request('/api/v1/auth/me', { token });
  assert.equal(stale.response.status, 401, 'Access token issued before the password change must be rejected');
  console.log('PASS Previous access token rejected (tokenVersion)');
  ok(await request('/api/v1/auth/me', { token: changed.accessToken }), 'Renewed access token accepted');

  if (process.env.CLAMAV_HOST) {
    const port = Number(process.env.CLAMAV_PORT || 3310);
    // Archivo de prueba estándar EICAR (68 bytes, inofensivo): todo antivirus debe marcarlo.
    const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    assert.equal(eicar.length, 68);
    const verdict = await scanWithClamav(process.env.CLAMAV_HOST, port, eicar);
    assert.ok(verdict && /eicar/i.test(verdict), `ClamAV must flag the EICAR test file (got ${verdict})`);
    console.log(`PASS ClamAV detects EICAR (${verdict})`);
    assert.equal(await scanWithClamav(process.env.CLAMAV_HOST, port, bytes), null, 'Clean file must pass ClamAV');
    console.log('PASS ClamAV passes a clean file');
  }
}

main().catch(error => {
  console.error('FAIL', error.message);
  process.exitCode = 1;
}).finally(async () => {
  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { professionalProfile: true } });
    if (user) {
      if (user.professionalProfile?.photoUrl) await storage.deleteObject(user.professionalProfile.photoUrl);
      await prisma.messageLog.deleteMany({ where: { recipient: email } });
      await prisma.auditLog.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      console.log('CLEANUP Temporary test account and object removed');
    }
    if (mailId) {
      const removal = await fetch(`http://mailpit:8025/api/v1/messages`, {
        method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ IDs: [mailId] }),
      });
      if (!removal.ok) console.log(`NOTE Test email retained in Mailpit (HTTP ${removal.status})`);
    }
  } catch (error) {
    console.error('CLEANUP FAILED', error.message);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
});
