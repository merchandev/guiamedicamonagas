// Suite de extremo a extremo contra una API real y su PostgreSQL.
//   E2E_API_URL=http://127.0.0.1:4000/api/v1 DATABASE_URL=postgresql://... npm run test:e2e
// Crea sus propios usuarios (sufijo aleatorio), así que puede correr varias veces.
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
async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
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
check('me: versiones legales aceptadas', r.data?.needsLegalAcceptance === false && r.data?.termsVersionAccepted === '2.0');

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
check('lista de pacientes muestra consentimiento', !!listed && listed.access.scopes.includes('HEALTH') && !('firstName' in listed));
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

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLO(S)`);
await db.end();
process.exit(failures ? 1 : 0);
