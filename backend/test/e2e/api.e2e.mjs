// Suite de extremo a extremo contra una API real y su PostgreSQL.
//   E2E_API_URL=http://127.0.0.1:4000/api/v1 DATABASE_URL=postgresql://... npm run test:e2e
// Crea sus propios usuarios (sufijo aleatorio), así que puede correr varias veces.
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const { Client } = pg;
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const run = Date.now().toString(36);
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures += 1;
};
async function call(method, path, body, token, extraHeaders = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}
const sha256Hex = (t) => createHash('sha256').update(t).digest('hex');
const pw = 'Prueba12345x';
const phone = '0414-' + String(Date.now()).slice(-7);

// 1. Registro con aceptación legal obligatoria
let r = await call('POST', '/auth/register', { email: `p-${run}@t.local`, password: pw, role: 'USER', firstName: 'Pedro', lastName: 'Luna', cedula: 'V-2' + run.slice(-6).replace(/\D/g, '7').padEnd(6, '1') });
check('registro sin acceptLegal → 400', r.status === 400, String(r.status));
const cedula = `V-3${String(Date.now()).slice(-7)}`;
r = await call('POST', '/auth/register', { email: `p-${run}@t.local`, password: pw, role: 'USER', firstName: 'Pedro', lastName: 'Luna', cedula, acceptLegal: true });
check('registro paciente', r.status === 201, String(r.status));
const patientToken = r.data?.accessToken;
r = await call('POST', '/auth/register', { email: `p2-${run}@t.local`, password: pw, role: 'USER', firstName: 'X', lastName: 'Y', cedula: cedula.replace('-', '').toLowerCase(), acceptLegal: true });
check('cédula duplicada (normalizada) → 409', r.status === 409, String(r.status));
r = await call('GET', '/auth/me', null, patientToken);
check('me: versiones legales aceptadas', r.data?.needsLegalAcceptance === false && r.data?.termsVersionAccepted === '2.2');

// 2. Ficha cifrada
r = await call('PATCH', '/patients/me', { phone: phone, bloodType: 'A+', allergies: 'Ninguna', conditionSummary: 'Asma leve', medications: [{ name: 'Salbutamol', schedule: 'SOS' }] }, patientToken);
check('actualizar ficha', r.status === 200 && r.data.conditionSummary === 'Asma leve' && r.data.phone === phone);
r = await call('PATCH', '/patients/me', { isHealthy: true, conditionSummary: 'no debería guardarse' }, patientToken);
check('persona sana limpia el resumen en servidor', r.data?.conditionSummary === null && r.data?.isHealthy === true);
let row = (await db.query(`select row_to_json(p)::text j from "PatientProfile" p where "patientCode"=$1`, [r.data.patientCode])).rows[0];
check('BD sin texto plano de salud/cédula/teléfono', !/Salbutamol|5550001|Asma|A\+/.test(row.j) && !row.j.includes(cedula.slice(2)));

// 3. Médico verificado con agenda
r = await call('POST', '/auth/register', { email: `d-${run}@t.local`, password: pw, role: 'PROFESSIONAL', firstName: 'Diana', lastName: 'Rojas', acceptLegal: true });
const doctorToken = r.data?.accessToken;
const doc = (await db.query(`select p.id from "ProfessionalProfile" p join "User" u on u.id=p."userId" where u.email=$1`, [`d-${run}@t.local`])).rows[0];
await db.query(`update "ProfessionalProfile" set "verificationStatus"='VERIFIED', "isPublished"=true, "planTier"='PROFESSIONAL', "verifiedAt"=now(), municipality='Maturín' where id=$1`, [doc.id]);
const sched = `s-${run}`;
await db.query(`insert into "Schedule"(id,"professionalId","slotDurationMinutes","updatedAt") values ($1,$2,30,now())`, [sched, doc.id]);
for (let d = 0; d < 7; d++) await db.query(`insert into "ScheduleBlock"(id,"scheduleId","dayOfWeek","startTime","endTime") values ($1,$2,$3,'00:00','23:30')`, [`${sched}-${d}`, sched, d]);

const today = new Date().toISOString().slice(0, 10);
const in3 = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
r = await call('GET', `/appointments/availability?professionalId=${doc.id}&from=${today}&to=${in3}`);
check('disponibilidad (America/Caracas)', r.status === 200 && r.data.length > 0, `${r.data?.length} slots`);
const slot = r.data[5];
r = await call('POST', '/appointments', { professionalId: doc.id, startsAt: slot, reason: 'Dolor de pecho', shareScopes: ['IDENTITY', 'HEALTH'], shareDays: 7 }, patientToken);
check('reserva con consentimiento', r.status === 201 && r.data.reason === 'Dolor de pecho', String(r.status));
const apptRow = (await db.query(`select reason from "Appointment" where id=$1`, [r.data.id])).rows[0];
check('motivo de consulta cifrado en BD', apptRow.reason.startsWith('gmm1.'));

// 4. Vista del médico según consentimiento
r = await call('GET', '/appointments/me/patients', null, doctorToken);
const listed = r.data?.find((p) => p.access.kind === 'GRANT');
check('lista de pacientes: consentimiento y nombre solo con identidad autorizada, sin contacto ni salud', !!listed && listed.access.scopes.includes('HEALTH') && listed.identity?.firstName === 'Pedro' && !('contact' in listed) && !('health' in listed));
r = await call('POST', `/appointments/me/patients/${listed.patientId}/data`, null, doctorToken);
check('médico lee solo lo autorizado', r.status === 201 && r.data.identity?.firstName === 'Pedro' && r.data.health?.bloodType === 'A+' && r.data.contact === null);
const audit = (await db.query(`select count(*)::int n from "AuditLog" where action='PATIENT_DATA_READ' and "resourceId"=$1`, [listed.patientId])).rows[0];
check('lectura auditada', audit.n >= 1);

// 5. Revocación
r = await call('GET', '/patients/me/grants', null, patientToken);
const grant = r.data.find((g) => !g.revokedAt);
r = await call('DELETE', `/patients/me/grants/${grant.id}`, null, patientToken);
check('paciente revoca', r.status === 200 && !!r.data.revokedAt);
r = await call('POST', `/appointments/me/patients/${listed.patientId}/data`, null, doctorToken);
check('tras revocar → 403', r.status === 403, String(r.status));
r = await call('POST', `/appointments/me/patients/${listed.patientId}/access-request`, { scopes: ['CONTACT'] }, doctorToken);
check('médico solicita acceso', r.status === 201, String(r.status));
r = await call('POST', `/appointments/me/patients/${listed.patientId}/access-request`, { scopes: ['CONTACT'] }, doctorToken);
check('segunda solicitud en 24 h → 429', r.status === 429, String(r.status));

// 6. Walk-in propio
r = await call('POST', '/appointments/me/manual', { startsAt: (await call('GET', `/appointments/availability?professionalId=${doc.id}&from=${in3}&to=${in3}`)).data[2], firstName: 'Walk', lastName: 'In', phone: phone }, doctorToken);
check('cita manual walk-in (mismo teléfono que un paciente con cuenta, sin choque)', r.status === 201, String(r.status));
const walk = (await call('GET', '/appointments/me/patients', null, doctorToken)).data.find((p) => p.createdByMe);
r = await call('POST', `/appointments/me/patients/${walk.patientId}/data`, null, doctorToken);
check('walk-in propio visible (identidad+contacto)', r.status === 201 && r.data.identity?.firstName === 'Walk' && r.data.contact?.phone === phone && r.data.health === null);

// 6b. Código de paciente (texto/QR): el paciente lo entrega y el médico lo registra en su directorio
r = await call('GET', '/patients/me/share-code', null, patientToken);
check('sin código hasta que el paciente lo genera', r.status === 200 && r.data.code === null);
r = await call('POST', '/patients/me/share-code', null, patientToken);
const shareCode = r.data?.code;
check('paciente genera su código (12 caracteres en grupos) y la URL del QR', r.status === 201 && /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(shareCode ?? '') && r.data.url?.endsWith(`/p/${shareCode}`), `${r.status} ${shareCode}`);
row = (await db.query(`select row_to_json(p)::text j from "PatientProfile" p join "User" u on u.id=p."userId" where u.email=$1`, [`p-${run}@t.local`])).rows[0];
check('el código queda cifrado en BD', !row.j.includes(shareCode.replace(/-/g, '')) && !row.j.includes(shareCode));
r = await call('GET', '/patients/me', null, patientToken);
check('la ficha no expone el código ni su hash', !JSON.stringify(r.data).includes('shareCode'));
r = await call('PATCH', '/patients/me/share-code', { scopes: ['IDENTITY', 'CONTACT'] }, patientToken);
check('paciente elige qué verá el médico que lo registre', r.status === 200 && r.data.scopes.join(',') === 'IDENTITY,CONTACT');
check('un paciente no puede registrar pacientes', (await call('POST', '/appointments/me/patients/register', { code: shareCode }, patientToken)).status === 403);
r = await call('POST', '/appointments/me/patients/register', { code: 'AAAA-BBBB-CCCC' }, doctorToken);
check('código inexistente → 404 (y queda auditado)', r.status === 404 && (await db.query(`select count(*)::int n from "AuditLog" where action='PATIENT_SHARE_CODE_FAILED' and "resourceId"=$1`, [doc.id])).rows[0].n >= 1, String(r.status));
r = await call('POST', '/appointments/me/patients/register', { code: shareCode.replace(/-/g, '').toLowerCase() }, doctorToken);
const sharedPatientId = r.data?.patientId;
check('médico registra al paciente con su código (sin guiones, minúsculas)', r.status === 201 && r.data.scopes.join(',') === 'IDENTITY,CONTACT', String(r.status));
r = await call('GET', '/appointments/me/patients', null, doctorToken);
const inDirectory = r.data?.find((p) => p.patientId === sharedPatientId);
check('aparece en el directorio del médico con nombre y autorización', inDirectory?.registered === true && inDirectory.identity?.firstName === 'Pedro' && inDirectory.access.kind === 'GRANT' && inDirectory.access.scopes.includes('CONTACT'));
check('ver el directorio con nombres queda auditado', (await db.query(`select count(*)::int n from "AuditLog" where action='PATIENT_DIRECTORY_VIEWED' and "resourceId"=$1`, [doc.id])).rows[0].n >= 1);
r = await call('POST', `/appointments/me/patients/${sharedPatientId}/data`, null, doctorToken);
check('médico ve lo elegido para el código (contacto sí, salud no)', r.status === 201 && r.data.contact?.phone === phone && r.data.health === null);
r = await call('GET', '/patients/me/grants', null, patientToken);
const codeGrant = r.data?.find((g) => !g.revokedAt && g.reason === 'Registro con el código del paciente');
check('el paciente ve la autorización del registro por código', !!codeGrant);
await call('DELETE', `/patients/me/grants/${codeGrant.id}`, null, patientToken);
r = await call('POST', '/appointments/me/patients/register', { code: shareCode }, doctorToken);
check('tras revocar, el mismo código no devuelve el acceso → 403', r.status === 403, String(r.status));
r = await call('POST', '/patients/me/share-code', null, patientToken);
const newShareCode = r.data?.code;
check('paciente rota su código', r.status === 201 && newShareCode && newShareCode !== shareCode);
check('el código anterior deja de funcionar', (await call('POST', '/appointments/me/patients/register', { code: shareCode }, doctorToken)).status === 404);
check('con el código nuevo el médico vuelve a registrarlo', (await call('POST', '/appointments/me/patients/register', { code: newShareCode }, doctorToken)).status === 201);
r = await call('DELETE', `/appointments/me/patients/${sharedPatientId}`, null, doctorToken);
check('médico quita al paciente de su directorio y pierde el acceso', r.status === 200 && (await call('POST', `/appointments/me/patients/${sharedPatientId}/data`, null, doctorToken)).status === 403);

// 7. Permisos granulares / sin bypass SUPERADMIN
const hash = await argon2.hash(pw, { type: argon2.argon2id });
for (const [role, email] of [['SUPERADMIN', `sa-${run}@t.local`], ['ADMIN', `ad-${run}@t.local`]]) {
  await db.query(`insert into "User"(id,email,"passwordHash",role,"isEmailVerified","updatedAt") values ($1,$2,$3,$4,true,now())`, [`${role}-${run}`, email, hash, role]);
}
const sa = (await call('POST', '/auth/login', { email: `sa-${run}@t.local`, password: pw })).data.accessToken;
const ad = (await call('POST', '/auth/login', { email: `ad-${run}@t.local`, password: pw })).data.accessToken;
check('SUPERADMIN no entra a rutas de PROFESSIONAL', (await call('GET', '/professionals/me', null, sa)).status === 403);
check('SUPERADMIN ve estadísticas', (await call('GET', '/admin/stats', null, sa)).status === 200);
check('ADMIN puede revisar pagos', (await call('GET', '/payments/admin/queue', null, ad)).status === 200);
check('ADMIN NO puede cambiar planes', (await call('GET', '/subscriptions/admin/plans', null, ad)).status === 403);
check('ADMIN NO puede editar SEO', (await call('PUT', '/seo/global', {}, ad)).status === 403);
check('paciente NO accede a admin', (await call('GET', '/admin/stats', null, patientToken)).status === 403);
r = await call('GET', '/auth/me', null, ad);
check('me expone permisos del rol', Array.isArray(r.data.permissions) && r.data.permissions.includes('REVIEW_PAYMENTS') && !r.data.permissions.includes('MANAGE_PLANS'));

// 8. Organizaciones
r = await call('POST', '/auth/register', { email: `o-${run}@t.local`, password: pw, role: 'ORGANIZATION', organizationName: `Farmacia Prueba ${run}`, organizationType: 'PHARMACY', organizationRif: 'J-12345678-9', acceptLegal: true });
check('registro de organización', r.status === 201, String(r.status));
const orgToken = r.data.accessToken;
const mine = (await call('GET', '/organizations/me/list', null, orgToken)).data;
check('nace PENDING y como OWNER', mine[0]?.verificationStatus === 'PENDING' && mine[0]?.role === 'OWNER');
const orgId = mine[0].id;
check('no aparece en el directorio público', !(await call('GET', '/organizations')).data.some((o) => o.id === orgId));
const loc = { name: 'Sede', address: 'Av. Bolívar', municipality: 'Maturín' };
r = await call('PUT', `/organizations/me/${orgId}`, { type: 'PHARMACY', name: `Farmacia Prueba ${run}`, rif: 'J-12345678-9', locations: [loc, { ...loc, name: 'Sede 2' }] }, orgToken);
check('plan gratis: 2 sedes → 400', r.status === 400, String(r.status));
r = await call('PUT', `/organizations/me/${orgId}`, { type: 'PHARMACY', name: `Farmacia Prueba ${run}`, rif: 'J-12345678-9', locations: [{ ...loc, municipality: 'Narnia' }] }, orgToken);
check('municipio fuera del catálogo → 400', r.status === 400, String(r.status));
r = await call('PUT', `/organizations/me/${orgId}`, { type: 'PHARMACY', name: `Farmacia Prueba ${run}`, rif: 'J-12345678-9', services: ['Entrega a domicilio'], paymentMethods: ['Pago Móvil'], locations: [loc] }, orgToken);
check('autogestión del perfil', r.status === 200 && r.data.services[0] === 'Entrega a domicilio');
await new Promise((res) => setTimeout(res, 61_000)); // límite de 5 registros/min por IP
check('otra cuenta no ve la organización (404)', (await call('GET', `/organizations/me/${orgId}`, null, (await call('POST', '/auth/register', { email: `o2-${run}@t.local`, password: pw, role: 'ORGANIZATION', organizationName: `Otra ${run}`, organizationType: 'CLINIC', acceptLegal: true })).data.accessToken)).status === 404);
r = await call('PATCH', `/organizations/admin/${orgId}/review`, { approved: true }, ad);
check('admin verifica organización', r.status === 200 && r.data.verificationStatus === 'VERIFIED');
check('ya aparece en el directorio público', (await call('GET', '/organizations')).data.some((o) => o.id === orgId));
await call('PUT', '/subscriptions/admin/exchange-rate', { usdToBs: 100 }, sa);
r = await call('POST', `/subscriptions/organizations/${orgId}`, null, orgToken);
const inst = r.data?.installments?.[0];
check('suscripción de organización con evidencia de tasa', r.status === 201 && Number(inst.bcvRate) > 0 && Number(inst.priceUsd) === 40 && !!inst.rateCapturedAt, String(r.status));
r = await call('POST', `/organizations/me/${orgId}/professionals`, { professionalId: doc.id }, orgToken);
check('asociar médicos requiere plan de organización', r.status === 403, String(r.status));

// 9. Analítica sin IP
r = await call('POST', '/analytics/track', { eventType: 'PROFILE_VIEW', resourceId: doc.id });
check('analítica acepta evento', r.status === 200);

// 10. SEO
r = await call('GET', '/professionals/sitemap?page=1');
check('sitemap paginado', r.status === 200 && r.data.pageSize === 1000 && r.data.items.some((i) => i.slug));
r = await call('GET', '/geo/municipalities');
check('catálogo de municipios', r.status === 200 && r.data.length === 13);
r = await call('GET', '/payments/banks');
check('catálogo de bancos desde API', r.status === 200 && r.data.length === 23);
r = await call('GET', '/professionals?limit=12');
check('listado incluye franja featured', r.status === 200 && Array.isArray(r.data.featured));

// 11. Verificación de identidad del paciente (la subida real necesita S3: se simula la clave)
const patientRow = (await db.query(`select p.id from "PatientProfile" p join "User" u on u.id=p."userId" where u.email=$1`, [`p-${run}@t.local`])).rows[0];
await db.query(`update "PatientProfile" set "idPhotoKey"='patient-id-documents/e2e.jpg', "identityStatus"='PENDING' where id=$1`, [patientRow.id]);
check('paciente NO ve la cola de identidad', (await call('GET', '/patients/admin/identity', null, patientToken)).status === 403);

// 11a. Bóveda: ni ADMIN ni SUPERADMIN ven registros de pacientes sin el código de seguridad
const vaultCode = process.env.E2E_PATIENT_VAULT_CODE;
check('E2E_PATIENT_VAULT_CODE definido para la prueba', !!vaultCode);
r = await call('GET', '/patients/admin/identity', null, ad);
check('ADMIN sin bóveda abierta → 403 PATIENT_VAULT_LOCKED', r.status === 403 && r.data?.code === 'PATIENT_VAULT_LOCKED', `${r.status} ${r.data?.code}`);
check('SUPERADMIN sin bóveda abierta → 403', (await call('GET', '/patients/admin/identity', null, sa)).status === 403);
r = await call('POST', '/patients/admin/vault/unlock', { code: 'codigo-equivocado' }, ad);
check('código de seguridad incorrecto → 403 y auditado', r.status === 403 && r.data?.code === 'PATIENT_VAULT_BAD_CODE' && (await db.query(`select count(*)::int n from "AuditLog" where action='PATIENT_VAULT_UNLOCK_FAILED' and "userId"=$1`, [`ADMIN-${run}`])).rows[0].n === 1);
r = await call('POST', '/patients/admin/vault/unlock', { code: vaultCode }, ad);
const vaultSetCookie = r.headers.get('set-cookie') ?? '';
const vaultCookie = vaultSetCookie.split(';')[0];
check('código correcto abre la bóveda 15 min (cookie httpOnly, SameSite=Strict, solo rutas de pacientes)', r.status === 200 && r.data.unlocked === true && /^gmm_patient_vault=/.test(vaultCookie) && /httponly/i.test(vaultSetCookie) && /samesite=strict/i.test(vaultSetCookie) && /path=\/api\/v1\/patients\/admin/i.test(vaultSetCookie), String(r.status));
check('en la BD solo queda el hash del token', (await db.query(`select count(*)::int n from "PatientVaultSession" where "userId"=$1 and "tokenHash"=$2`, [`ADMIN-${run}`, sha256Hex(vaultCookie.split('=')[1])])).rows[0].n === 1);
check('la bóveda de un admin no sirve a otra cuenta', (await call('GET', '/patients/admin/identity', null, sa, { cookie: vaultCookie })).status === 403);
const withVault = { cookie: vaultCookie };
r = await call('GET', '/patients/admin/identity', null, ad, withVault);
check('cola de identidad sin cédula (bóveda abierta)', r.status === 200 && r.data.items.some((i) => i.id === patientRow.id) && !JSON.stringify(r.data).includes(cedula));
r = await call('GET', `/patients/admin/identity/${patientRow.id}`, null, ad, withVault);
check('caso de identidad: cédula descifrada y foto firmada', r.status === 200 && r.data.cedula === cedula && !!r.data.idPhotoUrl);
check('apertura del caso auditada', (await db.query(`select count(*)::int n from "AuditLog" where action='PATIENT_IDENTITY_DOCUMENT_VIEWED' and "resourceId"=$1`, [patientRow.id])).rows[0].n === 1);
check('rechazo sin motivo → 400', (await call('PATCH', `/patients/admin/identity/${patientRow.id}/review`, { approved: false }, ad, withVault)).status === 400);
r = await call('PATCH', `/patients/admin/identity/${patientRow.id}/review`, { approved: false, note: 'Foto borrosa' }, ad, withVault);
row = (await db.query(`select "idPhotoKey", "identityStatus" from "PatientProfile" where id=$1`, [patientRow.id])).rows[0];
check('rechazo borra la foto', r.status === 200 && row.identityStatus === 'REJECTED' && row.idPhotoKey === null);
r = await call('GET', '/patients/me', null, patientToken);
check('paciente ve el motivo del rechazo', r.data?.identityStatus === 'REJECTED' && r.data?.identityReviewNote === 'Foto borrosa' && !('identityReviewedById' in r.data));
r = await call('POST', '/patients/admin/vault/lock', null, ad, withVault);
check('cerrar la bóveda la invalida al instante', r.status === 200 && (await call('GET', '/patients/admin/identity', null, ad, withVault)).status === 403);
for (let i = 0; i < 5; i++) await db.query(`insert into "AuditLog"(id,"userId",action,resource) values ($1,$2,'PATIENT_VAULT_UNLOCK_FAILED','PatientVault')`, [`vf-${run}-${i}`, `SUPERADMIN-${run}`]);
check('5 intentos fallidos bloquean la cuenta 15 min, aun con el código correcto → 429', (await call('POST', '/patients/admin/vault/unlock', { code: vaultCode }, sa)).status === 429);
r = await call('GET', '/admin/stats', null, sa);
check('el feed de administración no muestra correos de pacientes', r.status === 200 && !JSON.stringify(r.data.recentAuditLogs).includes(`p-${run}@t.local`));

// 12. Sesiones: tokenVersion invalida access tokens vigentes
r = await call('POST', '/auth/change-password', { currentPassword: pw, newPassword: 'Nueva12345x' }, patientToken);
const renewed = r.data?.accessToken;
check('cambio de contraseña renueva la sesión actual', r.status === 200 && !!renewed, String(r.status));
check('access token anterior → 401 al instante', (await call('GET', '/auth/me', null, patientToken)).status === 401);
check('access token nuevo funciona', (await call('GET', '/auth/me', null, renewed)).status === 200);
check('logout-all', (await call('POST', '/auth/logout-all', null, renewed)).status === 200);
check('tras logout-all el token → 401', (await call('GET', '/auth/me', null, renewed)).status === 401);
check('login con la contraseña nueva', (await call('POST', '/auth/login', { email: `p-${run}@t.local`, password: 'Nueva12345x' })).status === 200);
const patientToken2 = (await call('POST', '/auth/login', { email: `p-${run}@t.local`, password: 'Nueva12345x' })).data.accessToken;

// 13. Equipo de organizaciones: invitaciones y roles (el rol global de la cuenta no decide)
// El token solo viaja por correo (en la BD queda su hash): la prueba fija un token conocido en la invitación creada.
const sha256 = (t) => createHash('sha256').update(t).digest('hex');
async function inviteWithKnownToken(token, email, role, as = orgToken) {
  const res = await call('POST', `/organizations/me/${orgId}/invitations`, { email, role }, as);
  if (res.status === 201) {
    await db.query(`update "OrganizationInvitation" set "tokenHash"=$1 where "organizationId"=$2 and email=$3 and "acceptedAt" is null and "revokedAt" is null`, [sha256(token), orgId, email]);
  }
  return res;
}
const edToken = randomBytes(32).toString('base64url');
r = await inviteWithKnownToken(edToken, `ed-${run}@t.local`, 'EDITOR');
// Prisma guarda UTC en columnas sin zona horaria: las horas se calculan en SQL, no con el reloj local.
const invRow = (await db.query(`select "tokenHash", round(extract(epoch from ("expiresAt" - (now() at time zone 'utc'))) / 3600)::int hours from "OrganizationInvitation" where email=$1`, [`ed-${run}@t.local`])).rows[0];
check('dueño invita a un editor (72 h, solo hash en BD)', r.status === 201 && invRow.tokenHash.length === 64 && invRow.hours === 72, `${r.status} ${invRow.hours} h`);
r = await call('GET', `/organizations/invitations/preview?token=${edToken}`);
check('vista previa pública con correo enmascarado', r.status === 200 && r.data.email === 'e***@t.local' && r.data.role === 'EDITOR' && r.data.accountExists === false);
const orgsBefore = (await db.query(`select count(*)::int n from "Organization"`)).rows[0].n;
r = await call('POST', '/auth/register', { email: `ed-${run}@t.local`, password: pw, role: 'ORGANIZATION', acceptLegal: true, invitationToken: edToken });
const edTokenAuth = r.data?.accessToken;
const orgsAfter = (await db.query(`select count(*)::int n from "Organization"`)).rows[0].n;
check('alta por invitación: se une sin crear otra organización', r.status === 201 && orgsAfter === orgsBefore, `${r.status} ${orgsBefore}→${orgsAfter}`);
check('el editor ve la organización con su rol', (await call('GET', '/organizations/me/list', null, edTokenAuth)).data?.[0]?.role === 'EDITOR');
check('el enlace sirve una sola vez', (await call('GET', `/organizations/invitations/preview?token=${edToken}`)).status === 404);

const orgNow = (await call('GET', `/organizations/me/${orgId}`, null, edTokenAuth)).data;
const editBody = { type: orgNow.type, name: orgNow.name, rif: orgNow.rif ?? undefined, locations: orgNow.locations.map(({ name, address, municipality }) => ({ name, address, municipality })) };
check('editor: cambiar el nombre (identidad) → 403', (await call('PUT', `/organizations/me/${orgId}`, { ...editBody, name: 'Otro nombre' }, edTokenAuth)).status === 403);
r = await call('PUT', `/organizations/me/${orgId}`, { ...editBody, description: 'Abierto 24 horas' }, edTokenAuth);
check('editor: editar contenido → 200', r.status === 200 && r.data.description === 'Abierto 24 horas', String(r.status));
check('editor: invitar miembros → 403', (await call('POST', `/organizations/me/${orgId}/invitations`, { email: `z-${run}@t.local`, role: 'EDITOR' }, edTokenAuth)).status === 403);
check('editor: gestionar el plan → 403', (await call('GET', `/subscriptions/organizations/${orgId}`, null, edTokenAuth)).status === 403);
check('editor: asociar médicos → 403', (await call('POST', `/organizations/me/${orgId}/professionals`, { professionalId: doc.id }, edTokenAuth)).status === 403);

const pInvite = randomBytes(32).toString('base64url');
await inviteWithKnownToken(pInvite, `x-${run}@t.local`, 'EDITOR');
check('aceptar con otra cuenta → 403', (await call('POST', '/organizations/invitations/accept', { token: pInvite }, patientToken2)).status === 403);
const pOwn = randomBytes(32).toString('base64url');
await inviteWithKnownToken(pOwn, `p-${run}@t.local`, 'ADMIN');
r = await call('POST', '/organizations/invitations/accept', { token: pOwn }, patientToken2);
check('una cuenta de paciente acepta y queda como ADMIN (rol global intacto)', r.status === 200 && r.data.role === 'ADMIN' && (await call('GET', '/auth/me', null, patientToken2)).data.role === 'USER', String(r.status));
check('admin: invitar a otro admin → 403', (await call('POST', `/organizations/me/${orgId}/invitations`, { email: `a2-${run}@t.local`, role: 'ADMIN' }, patientToken2)).status === 403);
r = await call('POST', `/organizations/me/${orgId}/invitations`, { email: `e2-${run}@t.local`, role: 'EDITOR' }, patientToken2);
check('admin: invitar editores → 201', r.status === 201, String(r.status));
check('admin: revocar invitación → 200', (await call('DELETE', `/organizations/me/${orgId}/invitations/${r.data[0].id}`, null, patientToken2)).status === 200);
const members = (await call('GET', `/organizations/me/${orgId}/members`, null, orgToken)).data;
const ownerMember = members.find((m) => m.role === 'OWNER');
const adminMember = members.find((m) => m.role === 'ADMIN');
check('admin: cambiar roles → 403', (await call('PATCH', `/organizations/me/${orgId}/members/${adminMember.id}`, { role: 'OWNER' }, patientToken2)).status === 403);
check('el único dueño no puede degradarse → 400', (await call('PATCH', `/organizations/me/${orgId}/members/${ownerMember.id}`, { role: 'EDITOR' }, orgToken)).status === 400);
r = await call('PATCH', `/organizations/me/${orgId}/members/${adminMember.id}`, { role: 'OWNER' }, orgToken);
check('dueño transfiere la propiedad', r.status === 200 && r.data.filter((m) => m.role === 'OWNER').length === 2, String(r.status));
check('invitaciones y cambios auditados', (await db.query(`select count(distinct action)::int n from "AuditLog" where "resourceId"=$1 and action in ('ORGANIZATION_INVITATION_SENT','ORGANIZATION_INVITATION_ACCEPTED','ORGANIZATION_INVITATION_REVOKED','ORGANIZATION_MEMBER_ROLE_CHANGED')`, [orgId])).rows[0].n === 4);

// 14. Concurrencia: citas y referencias de Pago Móvil
const freeSlots = (await call('GET', `/appointments/availability?professionalId=${doc.id}&from=${in3}&to=${in3}`)).data;
const raceSlot = freeSlots[freeSlots.length - 1];
const bookings = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/appointments', { professionalId: doc.id, startsAt: raceSlot }, patientToken2)));
check('10 reservas simultáneas del mismo horario → 1 creada', bookings.filter((b) => b.status === 201).length === 1 && bookings.filter((b) => b.status === 409).length === 9, bookings.map((b) => b.status).join(','));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const ref = `9${Date.now()}`.slice(0, 12);
const inserts = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => pool.query(
  `insert into "Payment"(id,"installmentId","amountBs","senderBankCode","referenceNumber","receiptFileKey","updatedAt") values ($1,$2,100,'0134',$3,'receipts/e2e.png',now())`,
  [`race-${run}-${i}`, inst.id, ref],
)));
await pool.end();
check('10 pagos simultáneos con la misma referencia → 1 guardado (índice único parcial)', inserts.filter((x) => x.status === 'fulfilled').length === 1 && inserts.filter((x) => x.reason?.code === '23505').length === 9);
await db.query(`update "Payment" set status='REJECTED' where "referenceNumber"=$1`, [ref]);
check('una referencia rechazada puede volver a reportarse', !!(await db.query(`insert into "Payment"(id,"installmentId","amountBs","senderBankCode","referenceNumber","updatedAt") values ($1,$2,100,'0134',$3,now()) returning id`, [`retry-${run}`, inst.id, ref])).rows[0]);

// 15. Descargas sensibles auditadas
const racePayment = (await db.query(`select id from "Payment" where "referenceNumber"=$1 and "receiptFileKey" is not null limit 1`, [ref])).rows[0];
r = await call('GET', `/payments/admin/${racePayment.id}/receipt`, null, ad);
check('comprobante de pago: apertura auditada', r.status === 200 && (await db.query(`select count(*)::int n from "AuditLog" where action='PAYMENT_RECEIPT_VIEWED' and "resourceId"=$1`, [racePayment.id])).rows[0].n === 1);
await db.query(`insert into "ProfessionalDocument"(id,"professionalId",type,"fileKey","originalFileName","mimeType","fileSizeBytes","updatedAt") values ($1,$2,'TITULO_MEDICO','documents/e2e.pdf','titulo.pdf','application/pdf',1000,now())`, [`doc-${run}`, doc.id]);
r = await call('GET', `/documents/admin/doc-${run}/download`, null, ad);
check('documento profesional: descarga auditada', r.status === 200 && (await db.query(`select count(*)::int n from "AuditLog" where action='PROFESSIONAL_DOCUMENT_DOWNLOADED' and "resourceId"=$1`, [`doc-${run}`])).rows[0].n === 1);

// 15b. Requisitos de verificación: la solvencia deontológica ya no se pide
r = await call('GET', '/documents/me', null, doctorToken);
check('requisitos del médico en orden de obtención y sin solvencia deontológica', r.status === 200 && r.data.required.map((x) => x.type).join(',') === 'CEDULA_IDENTIDAD,RIF,TITULO_MEDICO,REGISTRO_MPPS_SACS,MATRICULA_COLEGIO_MONAGAS,ARTICULO_8' && !r.data.required.some((x) => x.type === 'SOLVENCIA_DEONTOLOGICA'), r.data?.required?.map((x) => x.type).join(','));
r = await call('GET', '/documents/requirements', null, doctorToken);
check('catálogo de documentos sin tipos retirados', r.status === 200 && !r.data.some((x) => x.type === 'SOLVENCIA_DEONTOLOGICA'));

// 15c. Publicación: 60% de documentos aprobados + biografía + foto; Plus/Premium con el 100%
r = await call('POST', '/auth/register', { email: `pub-${run}@t.local`, password: pw, role: 'PROFESSIONAL', firstName: 'Paula', lastName: 'Mora', acceptLegal: true });
const pubToken = r.data?.accessToken;
const pub = (await db.query(`select p.id, p.slug from "ProfessionalProfile" p join "User" u on u.id=p."userId" where u.email=$1`, [`pub-${run}@t.local`])).rows[0];
const pubDoc = async (type, status) => db.query(`insert into "ProfessionalDocument"(id,"professionalId",type,"fileKey","originalFileName","mimeType","fileSizeBytes",status,"updatedAt") values ($1,$2,$3,'documents/e2e.pdf','doc.pdf','application/pdf',1000,$4,now())`, [`pub-${run}-${type}`, pub.id, type, status]);
for (const type of ['CEDULA_IDENTIDAD', 'RIF', 'TITULO_MEDICO']) await pubDoc(type, 'APPROVED');
await pubDoc('REGISTRO_MPPS_SACS', 'PENDING');
await db.query(`update "ProfessionalProfile" set "photoUrl"='professionals/e2e.png' where id=$1`, [pub.id]);
r = await call('PATCH', '/professionals/me', { firstName: 'Paula', lastName: 'Mora', bio: 'Médico cirujano con diez años de experiencia en atención primaria y medicina familiar en Maturín.' }, pubToken);
check('3 de 6 aprobados + biografía + foto → no se publica', r.status === 200 && (await call('GET', `/professionals/${pub.slug}`)).status === 404, String(r.status));
r = await call('GET', '/professionals/me', null, pubToken);
check('barra de progreso: incluye documentos, redes y web bloqueadas por plan', r.status === 200 && typeof r.data.progress?.percent === 'number' && r.data.progress.items.some((i) => i.key === 'documents' && i.detail?.startsWith('3 de 6')) && r.data.progress.items.find((i) => i.key === 'website')?.lockedUntil === 'PREMIUM' && r.data.progress.canPublish === false);
r = await call('PATCH', `/documents/admin/pub-${run}-REGISTRO_MPPS_SACS/review`, { approved: true }, ad);
const pubPublic = await call('GET', `/professionals/${pub.slug}`);
check('4 de 6 aprobados + biografía + foto → público, aún sin sello «Verificado»', r.status === 200 && pubPublic.status === 200 && pubPublic.data?.verificationStatus === 'IN_REVIEW', `${r.status}/${pubPublic.status}/${pubPublic.data?.verificationStatus}`);
const plans = (await call('GET', '/subscriptions/plans')).data ?? [];
r = await call('POST', '/subscriptions/me', { planId: plans.find((p) => p.tier === 'PROFESSIONAL_PLUS')?.id }, pubToken);
check('Profesional Plus sin el 100% de documentos → 403', r.status === 403, String(r.status));
r = await call('PATCH', '/professionals/me', { firstName: 'Paula', lastName: 'Mora', bio: 'Corta' }, pubToken);
check('sin biografía completa deja de ser público', r.status === 200 && (await call('GET', `/professionals/${pub.slug}`)).status === 404);

// 16. Migración de datos heredados completa
check('_PatientPlaintextLegacy no existe', (await db.query(`select to_regclass('public."_PatientPlaintextLegacy"') t`)).rows[0].t === null);

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLO(S)`);
await db.end();
process.exit(failures ? 1 : 0);
