// Ejecutar solo contra una base de pruebas desechable, nunca contra producción.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';

const databaseName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (process.env.NODE_ENV !== 'test' || !['gmm_admin_test', 'gmm_ci'].includes(databaseName)) {
  throw new Error('Esta suite exige NODE_ENV=test y una base gmm_admin_test o gmm_ci');
}
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4319/api/v1';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const run = randomUUID().slice(0, 8);
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const passwordHash = 'test-fixture-only-not-a-login-password';
const ids = { admin: randomUUID(), superadmin: randomUUID(), doctor: randomUUID(), patient: randomUUID(), outsider: randomUUID(),
  profile: randomUUID(), patientProfile: randomUUID(), modDoctor: randomUUID(), modProfile: randomUUID() };
const token = (id, role, tv = 0) => jwt.sign({ sub: id, email: `${id}@test.invalid`, role, tv }, { expiresIn: '10m' });
const adminToken = token(ids.admin, 'ADMIN');
const superToken = token(ids.superadmin, 'SUPERADMIN');
const doctorToken = token(ids.doctor, 'PROFESSIONAL');
const patientToken = token(ids.patient, 'USER');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
let checks = 0;
async function call(method, path, body, auth = adminToken, cookie) {
  const res = await fetch(API + path, { method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
}
// El inicio de sesión y el registro tienen límite por minuto: si la suite anterior lo agotó, se espera una vez.
async function publicPost(path, body) {
  let r = await call('POST', path, body, null);
  if (r.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    r = await call('POST', path, body, null);
  }
  return r;
}
const login = (email, password) => publicPost('/auth/login', { email, password });
const count = async (sql, params) => (await db.query(sql, params)).rows[0].n;
function check(label, condition) { assert.ok(condition, label); console.log('PASS', label); checks++; }
const mod = (action) => ({ action, reason: 'Prueba administrativa controlada' });
const purgeBody = { reason: 'Solicitud de supresión del titular', confirm: 'ELIMINAR' };
try {
  for (const [key, role] of [['admin','ADMIN'], ['superadmin','SUPERADMIN'], ['doctor','PROFESSIONAL'], ['patient','USER'], ['outsider','USER']]) {
    await db.query('INSERT INTO "User" (id,email,"passwordHash",role,"isEmailVerified","updatedAt") VALUES ($1,$2,$3,$4,true,now())',
      [ids[key], `${key}-${run}@test.invalid`, passwordHash, role]);
  }
  await db.query('INSERT INTO "ProfessionalProfile" (id,"userId","firstName","lastName",slug,"verificationStatus","isPublished","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,true,now())',
    [ids.profile,ids.doctor,'Doctora','Prueba',`doctor-${run}`,'VERIFIED']);
  await db.query('INSERT INTO "PatientProfile" (id,"userId","patientCode","firstName","lastName","updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
    [ids.patientProfile,ids.patient,`TEST-${run}`,'Paciente','Protegido']);
  // Médico con contraseña real, documentos completos, biografía y foto: publicado y verificado.
  const modEmail = `mod-${run}@test.invalid`;
  // Contraseña efímera generada en cada ejecución (nunca un literal en el repositorio).
  const modPassword = `E2e-${randomBytes(12).toString('base64url')}`;
  await db.query('INSERT INTO "User" (id,email,"passwordHash",role,"isEmailVerified","updatedAt") VALUES ($1,$2,$3,\'PROFESSIONAL\',true,now())',
    [ids.modDoctor, modEmail, await argon2.hash(modPassword, { type: argon2.argon2id })]);
  await db.query('INSERT INTO "ProfessionalProfile" (id,"userId","firstName","lastName",slug,"verificationStatus","isPublished","verifiedAt",bio,"photoUrl","updatedAt") VALUES ($1,$2,\'Marta\',\'Moderada\',$3,\'VERIFIED\',true,now(),$4,\'professionals/e2e.png\',now())',
    [ids.modProfile, ids.modDoctor, `marta-${run}`, 'Médica cirujana con doce años de experiencia en atención primaria, medicina familiar y control de enfermedades crónicas en Maturín.']);
  for (const type of ['CEDULA_IDENTIDAD', 'RIF', 'TITULO_MEDICO', 'REGISTRO_MPPS_SACS', 'MATRICULA_COLEGIO_MONAGAS', 'ARTICULO_8']) {
    await db.query('INSERT INTO "ProfessionalDocument" (id,"professionalId",type,"fileKey","originalFileName","mimeType","fileSizeBytes",status,"updatedAt") VALUES ($1,$2,$3,\'documents/e2e.pdf\',\'doc.pdf\',\'application/pdf\',1000,\'APPROVED\',now())',
      [randomUUID(), ids.modProfile, type]);
  }
  // Bóveda del SUPERADMIN: se crea la sesión en la BD (solo guarda el hash) para no gastar el límite de aperturas.
  const superVaultToken = randomBytes(32).toString('base64url');
  await db.query('INSERT INTO "PatientVaultSession" (id,"userId","tokenHash","expiresAt") VALUES ($1,$2,$3,(now() at time zone \'utc\') + interval \'15 minutes\')',
    [randomUUID(), ids.superadmin, sha256(superVaultToken)]);
  const superVault = `gmm_patient_vault=${superVaultToken}`;
  const patientCedula = `V-${String(Date.now()).slice(-8)}`;
  const patientPhone = `0414-${String(Date.now()).slice(-7)}`;
  let r = await call('PATCH','/patients/me',{ cedula: patientCedula, phone: patientPhone },patientToken);
  check('el paciente carga su cédula y teléfono (cifrados)', r.status === 200);

  // Pago Móvil de la plataforma: lo registra el SUPERADMIN y solo se ve con sesión de médico u organización.
  await db.query('DELETE FROM "SiteSettings" WHERE key=\'pago_movil_account\'');
  const pmBank=(await db.query('SELECT code FROM "FinancialInstitution" WHERE "isActive"=true AND "supportsPagoMovil"=true LIMIT 1')).rows[0];
  const pm={holderName:'  Titular de Prueba ',documentId:'v12345678',bankCode:pmBank.code,accountNumber:`${pmBank.code} 0000 00 0000000001`,phone:'0414-1234567'};
  const pmPath='/payments/admin/pago-movil-account';
  check('los datos de Pago Móvil no son públicos',(await call('GET','/payments/pago-movil-account',null,null)).status===401);
  check('un paciente no ve los datos de Pago Móvil',(await call('GET','/payments/pago-movil-account',null,patientToken)).status===403);
  r=await call('GET','/payments/pago-movil-account',null,doctorToken);
  check('sin registrar, el médico ve que aún no hay datos para pagar',r.status===200 && r.data.configured===false && r.data.phone===null);
  check('ADMIN consulta los datos pero no cambia a dónde llegan los pagos',(await call('GET',pmPath)).status===200 && (await call('PUT',pmPath,pm)).status===403);
  check('un médico no usa la ruta administrativa',(await call('PUT',pmPath,pm,doctorToken)).status===403);
  check('cuenta que no empieza por el código del banco → 400',(await call('PUT',pmPath,{...pm,accountNumber:`9999${'0'.repeat(16)}`},superToken)).status===400);
  check('cuenta sin 20 dígitos, teléfono o cédula inválidos → 400',(await call('PUT',pmPath,{...pm,accountNumber:`${pmBank.code}123`},superToken)).status===400
    && (await call('PUT',pmPath,{...pm,phone:'12345'},superToken)).status===400 && (await call('PUT',pmPath,{...pm,documentId:'12345678'},superToken)).status===400);
  check('banco fuera del catálogo → 400',(await call('PUT',pmPath,{...pm,bankCode:'9998',accountNumber:`9998${'0'.repeat(16)}`},superToken)).status===400);
  r=await call('PUT',pmPath,pm,superToken);
  check('el SUPERADMIN registra su Pago Móvil, normalizado y auditado',r.status===200 && r.data.configured===true && r.data.holderName==='Titular de Prueba'
    && r.data.documentId==='V-12345678' && r.data.accountNumber===`${pmBank.code}0000000000000001` && r.data.phone==='0414-1234567' && !!r.data.bankName
    && await count('SELECT count(*)::int n FROM "AuditLog" WHERE "userId"=$1 AND action=\'PAGO_MOVIL_ACCOUNT_UPDATED\'',[ids.superadmin])===1);
  r=await call('GET','/payments/pago-movil-account',null,doctorToken);
  check('el médico ve los datos dentro de su panel para pagar y reportar',r.status===200 && r.data.configured===true && r.data.holderName==='Titular de Prueba'
    && r.data.accountNumber.length===20 && r.data.bankCode===pmBank.code);

  r = await call('GET','/admin/accounts/professionals',null,doctorToken);
  check('profesional no puede listar cuentas administrativas', r.status === 403);
  r = await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,mod('DELETE'),patientToken);
  check('paciente no puede dar de baja médicos', r.status === 403);
  r = await call('GET','/patients/admin/accounts');
  check('administrador requiere bóveda para listar pacientes',r.status === 403 && r.data.code === 'PATIENT_VAULT_LOCKED');
  r = await call('PATCH',`/patients/admin/accounts/${ids.patient}`,mod('DELETE'));
  check('administrador requiere bóveda también para modificar pacientes',r.status === 403);
  r = await call('POST','/patients/admin/vault/unlock',{code:process.env.E2E_PATIENT_VAULT_CODE});
  check('apertura de bóveda',r.status === 200);
  const vaultCookie = r.headers.get('set-cookie')?.split(';')[0];
  r = await call('GET',`/patients/admin/accounts?search=${run}`,null,adminToken,vaultCookie);
  check('lista paciente sin descifrar datos de salud ni identificación',r.status===200 && r.data.items.some(x=>x.id===ids.patient) && !JSON.stringify(r.data).includes('healthDataEnc'));
  r = await call('GET',`/patients/admin/accounts?search=${encodeURIComponent(patientCedula.replace('-', '').toLowerCase())}`,null,adminToken,vaultCookie);
  check('busca pacientes por cédula exacta (por su hash)',r.status===200 && r.data.items.some(x=>x.id===ids.patient) && !JSON.stringify(r.data).includes(patientCedula));
  r = await call('GET',`/patients/admin/accounts?search=${encodeURIComponent(patientPhone)}`,null,adminToken,vaultCookie);
  check('busca pacientes por teléfono exacto (por su hash)',r.status===200 && r.data.items.some(x=>x.id===ids.patient));
  r = await call('PATCH',`/patients/admin/accounts/${ids.admin}`,mod('DELETE'),adminToken,vaultCookie);
  check('no se permite borrar al administrador por ruta de pacientes',r.status===404);
  r = await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,{action:'DELETE',reason:'  '});
  check('motivo vacío rechazado',r.status===400);
  const grantsId=randomUUID();
  await db.query('INSERT INTO "PatientDataGrant" (id,"patientId","professionalId",scopes,"expiresAt","consentVersion") VALUES ($1,$2,$3,ARRAY[\'HEALTH\']::"PatientDataScope"[],now()+interval \'1 day\',\'test\')',[grantsId,ids.patientProfile,ids.profile]);
  await db.query('INSERT INTO "RefreshToken" (id,"userId","tokenHash","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')',[randomUUID(),ids.patient,run]);
  await db.query('UPDATE "PatientProfile" SET "shareScopes"=ARRAY[\'IDENTITY\',\'HEALTH\']::"PatientDataScope"[], "shareCodeLookup"=$2, "shareCodeEnc"=\'x\' WHERE id=$1',[ids.patientProfile,`lookup-${run}`]);
  r=await call('PATCH',`/patients/admin/accounts/${ids.patient}`,mod('DELETE'),adminToken,vaultCookie);
  check('baja de paciente reversible',r.status===200 && !!r.data.deletedAt);
  const patientState=(await db.query('SELECT u."isActive",u."deletedAt",p."shareCodeLookup",array_to_string(p."shareScopes",\',\') scopes FROM "User" u JOIN "PatientProfile" p ON p."userId"=u.id WHERE u.id=$1',[ids.patient])).rows[0];
  check('baja conserva ficha, bloquea cuenta e invalida el código',!patientState.isActive && patientState.deletedAt && !patientState.shareCodeLookup);
  check('baja conserva la preferencia de qué compartir (no la vacía)',patientState.scopes === 'IDENTITY,HEALTH');
  check('baja revoca consentimiento',!!(await db.query('SELECT "revokedAt" FROM "PatientDataGrant" WHERE id=$1',[grantsId])).rows[0].revokedAt);
  check('baja revoca refresh',!!(await db.query('SELECT "revokedAt" FROM "RefreshToken" WHERE "userId"=$1',[ids.patient])).rows[0].revokedAt);
  check('token previo de paciente deja de servir',(await call('GET','/auth/me',null,patientToken)).status===401);
  check('el paciente recibe el aviso de la baja',await count('SELECT count(*)::int n FROM "Notification" WHERE "userId"=$1 AND type=\'ACCOUNT_DELETE\'',[ids.patient])===1
    && await count('SELECT count(*)::int n FROM "MessageLog" WHERE "relatedUserId"=$1 AND template=\'account_delete\'',[ids.patient])===1);
  r=await call('PATCH',`/patients/admin/accounts/${ids.patient}`,mod('RESTORE'),adminToken,vaultCookie);
  check('restauración no restaura sesiones antiguas',r.status===200 && (await call('GET','/auth/me',null,patientToken)).status===401);
  check('restauración no restaura consentimiento',!!(await db.query('SELECT "revokedAt" FROM "PatientDataGrant" WHERE id=$1',[grantsId])).rows[0].revokedAt);
  r=await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,mod('SUSPEND'));
  check('suspensión de médico bloquea sesión',r.status===200 && (await call('GET','/auth/me',null,doctorToken)).status===401);
  check('médico suspendido sale del directorio',!(await db.query('SELECT "isPublished" FROM "ProfessionalProfile" WHERE id=$1',[ids.profile])).rows[0].isPublished);
  r = await call('PATCH',`/professionals/admin/${ids.profile}/suspend`,{suspended:false});
  check('el control anterior no reactiva una cuenta suspendida',r.status === 403);
  r = await call('GET','/professionals/admin/list?status=SUSPENDED&limit=50');
  check('la lista de médicos informa que lo suspendido es la cuenta',r.status === 200 && r.data.items.find(x=>x.id===ids.profile)?.user.isActive === false
    && r.data.items.find(x=>x.id===ids.profile)?.user.id === ids.doctor);
  await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,mod('RESTORE'));
  const reinstated=(await db.query('SELECT "verificationStatus","isPublished" FROM "ProfessionalProfile" WHERE id=$1',[ids.profile])).rows[0];
  check('reactivar sin documentos: queda pendiente de documentos y fuera del directorio',reinstated.verificationStatus==='PENDING' && reinstated.isPublished===false);

  // Mensaje al iniciar sesión, avisos y reactivación según sus documentos.
  check('médico activo inicia sesión',(await login(modEmail, modPassword)).status===200);
  r=await call('PATCH',`/admin/accounts/professionals/${ids.modDoctor}`,mod('SUSPEND'));
  check('suspender médico verificado',r.status===200);
  check('el médico recibe el aviso de la suspensión (panel y correo)',await count('SELECT count(*)::int n FROM "Notification" WHERE "userId"=$1 AND type=\'ACCOUNT_SUSPEND\'',[ids.modDoctor])===1
    && await count('SELECT count(*)::int n FROM "MessageLog" WHERE "relatedUserId"=$1 AND template=\'account_suspend\'',[ids.modDoctor])===1);
  check('con contraseña incorrecta no revela la suspensión',(await login(modEmail,'Incorrecta123x')).status===401);
  r=await login(modEmail, modPassword);
  check('con la contraseña correcta explica la suspensión',r.status===403 && r.data?.code==='ACCOUNT_SUSPENDED');
  r=await call('PATCH',`/admin/accounts/professionals/${ids.modDoctor}`,mod('RESTORE'));
  const restored=(await db.query('SELECT "verificationStatus","isPublished" FROM "ProfessionalProfile" WHERE id=$1',[ids.modProfile])).rows[0];
  check('reactivar con documentos completos: vuelve verificado y al directorio',r.status===200 && restored.verificationStatus==='VERIFIED' && restored.isPublished===true);
  const relogin=await login(modEmail, modPassword);
  check('inicia sesión tras reactivar',relogin.status===200 && !!relogin.data?.accessToken);
  const modToken=relogin.data.accessToken;

  // Plan Marca Médica: precios del catálogo, asignación y video de presentación.
  r=await call('GET','/subscriptions/plans',null,null);
  const catalog=Object.fromEntries((r.data??[]).map(p=>[p.tier,Number(p.priceUsd)]));
  check('catálogo con los precios nuevos y el plan Marca Médica',catalog.PROFESSIONAL===3.99 && catalog.PROFESSIONAL_PLUS===5.99
    && catalog.PREMIUM===10.99 && catalog.AGENCY===69.99);
  const planNames=Object.fromEntries((r.data??[]).map(p=>[p.tier,p.name]));
  check('los planes se llaman Perfil Básico, Profesional, Plus, Premium y Marca Médica',planNames.FREE==='Perfil Básico' && planNames.PROFESSIONAL==='Profesional'
    && planNames.PROFESSIONAL_PLUS==='Plus' && planNames.PREMIUM==='Premium' && planNames.AGENCY==='Marca Médica'
    && !JSON.stringify(r.data).includes('Profesional Plus') && !JSON.stringify(r.data).includes('Agencia'));
  check('Marca Médica deja explícitos los 2 videos cada mes',(r.data??[]).find(p=>p.tier==='AGENCY')?.features?.includes('2 videos profesionales cada mes'));

  // Video de muestra de Marca Médica en /planes: lo cambia solo quien gestiona los planes (SUPERADMIN).
  await db.query('DELETE FROM "SiteSettings" WHERE key=\'plan_showcase\'');
  r=await call('GET','/subscriptions/showcase',null,null);
  check('sin video de muestra, la página pública recibe null',r.status===200 && r.data.sampleVideoId===null);
  check('ADMIN no cambia el video de muestra',(await call('PUT','/subscriptions/admin/showcase',{url:'https://youtube.com/shorts/aqz-KE-bpKQ'})).status===403);
  check('el video de muestra tiene que ser de YouTube',(await call('PUT','/subscriptions/admin/showcase',{url:'https://vimeo.com/123456789'},superToken)).status===400);
  r=await call('PUT','/subscriptions/admin/showcase',{url:'https://youtube.com/shorts/aqz-KE-bpKQ?feature=share'},superToken);
  check('el SUPERADMIN publica un Short como muestra (solo el ID, auditado)',r.status===200 && r.data.sampleVideoId==='aqz-KE-bpKQ'
    && (await call('GET','/subscriptions/showcase',null,null)).data.sampleVideoId==='aqz-KE-bpKQ'
    && await count('SELECT count(*)::int n FROM "AuditLog" WHERE "userId"=$1 AND action=\'PLAN_SAMPLE_VIDEO_SET\'',[ids.superadmin])===1);
  r=await call('PUT','/subscriptions/admin/showcase',{url:null},superToken);
  check('quitar el video de muestra vuelve a la ilustración',r.status===200 && r.data.sampleVideoId===null);

  // Estadísticas del médico según su plan.
  const doctorTv=(await db.query('SELECT "tokenVersion" FROM "User" WHERE id=$1',[ids.doctor])).rows[0].tokenVersion;
  r=await call('GET','/analytics/me',null,token(ids.doctor,'PROFESSIONAL',doctorTv));
  check('el Perfil Básico no incluye estadísticas',r.status===200 && r.data.level==='NONE' && !r.data.events);
  const videoId='dQw4w9WgXcQ';
  r=await call('PUT','/professionals/me/presentation-video',{url:`https://youtu.be/${videoId}?si=e2e`},modToken);
  check('sin el plan Marca Médica el médico no puede poner video',r.status===403);
  const agencyBank=(await db.query('SELECT code FROM "FinancialInstitution" WHERE "isActive"=true AND "supportsPagoMovil"=true LIMIT 1')).rows[0];
  r=await call('POST',`/subscriptions/admin/professionals/${ids.modProfile}/assign-paid-plan`,{
    planId:(await db.query('SELECT id FROM "SubscriptionPlan" WHERE tier=\'AGENCY\'')).rows[0].id,amountBs:25000,method:'PAGO_MOVIL',
    senderBankCode:agencyBank.code,referenceNumber:`AGENCY-${run}`.toUpperCase(),paidAt:new Date(Date.now()-60000).toISOString(),
    reason:'Pago del plan Marca Médica revisado en prueba'});
  check('asigna el plan Marca Médica a un médico con documentos completos',r.status===201
    && (await db.query('SELECT "planTier" FROM "ProfessionalProfile" WHERE id=$1',[ids.modProfile])).rows[0].planTier==='AGENCY');
  // Tres visitas y un clic de WhatsApp recientes, y una visita de hace 45 días.
  for (const [type, days] of [['PROFILE_VIEW',1],['PROFILE_VIEW',2],['PROFILE_VIEW',3],['WHATSAPP_CLICK',1],['PROFILE_VIEW',45]]) {
    await db.query('INSERT INTO "AnalyticsEvent" (id,"eventType","resourceId","createdAt") VALUES ($1,$2,$3,(now() at time zone \'utc\') - make_interval(days => $4))',
      [randomUUID(), type, ids.modProfile, days]);
  }
  r=await call('GET','/analytics/me',null,modToken);
  check('Marca Médica ve analítica avanzada: visitas, contactos, citas, comparación y 6 meses',r.status===200 && r.data.level==='ADVANCED'
    && r.data.events.last30.PROFILE_VIEW===3 && r.data.events.previous30.PROFILE_VIEW===1 && r.data.events.total.PROFILE_VIEW===4
    && r.data.events.last30.WHATSAPP_CLICK===1 && typeof r.data.appointments.last30.total==='number' && typeof r.data.messages.last30==='number'
    && r.data.monthly.length===6);
  r=await call('PUT','/professionals/me/presentation-video',{url:'https://vimeo.com/123456789'},modToken);
  check('rechaza un enlace que no es de YouTube',r.status===400);
  r=await call('PUT','/professionals/me/presentation-video',{url:`https://youtu.be/${videoId}?si=e2e`},modToken);
  check('con Agencia se guarda solo el ID del video',r.status===200 && r.data.presentationVideoId===videoId);
  r=await call('GET',`/professionals/marta-${run}`,null,null);
  check('la ficha pública muestra el video, el plan Marca Médica y el destacado',r.status===200 && r.data.presentationVideoId===videoId
    && r.data.planTier==='AGENCY' && r.data.isFeatured===true);
  r=await call('GET','/professionals',null,null);
  check('Agencia va primero en la franja «Destacado»',r.status===200 && r.data.featured?.[0]?.planTier==='AGENCY');
  r=await call('PUT',`/admin/accounts/professionals/${ids.modDoctor}/presentation-video`,{url:'https://www.youtube.com/watch?v=aqz-KE-bpKQ'},modToken);
  check('un médico no usa la ruta administrativa del video',r.status===403);
  r=await call('PUT',`/admin/accounts/professionals/${ids.modDoctor}/presentation-video`,{url:'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=5s'});
  check('el administrador cambia el video y queda auditado',r.status===200 && r.data.presentationVideoId==='aqz-KE-bpKQ'
    && await count('SELECT count(*)::int n FROM "AuditLog" WHERE "userId"=$1 AND action=\'PROFESSIONAL_VIDEO_SET\' AND "resourceId"=$2',[ids.admin,ids.modProfile])===1);
  r=await call('PUT',`/admin/accounts/professionals/${ids.patient}/presentation-video`,{url:`https://youtu.be/${videoId}`});
  check('la ruta del video solo aplica a médicos',r.status===404);
  // Al bajar de plan el video se conserva, oculto; quitarlo siempre se puede.
  await db.query('UPDATE "ProfessionalProfile" SET "planTier"=\'PREMIUM\' WHERE id=$1',[ids.modProfile]);
  r=await call('GET',`/professionals/marta-${run}`,null,null);
  check('sin Agencia la ficha no muestra el video, pero queda guardado',r.status===200 && r.data.presentationVideoId===null
    && (await db.query('SELECT "presentationVideoId" FROM "ProfessionalProfile" WHERE id=$1',[ids.modProfile])).rows[0].presentationVideoId==='aqz-KE-bpKQ');
  r=await call('PUT','/professionals/me/presentation-video',{url:null},modToken);
  check('el médico puede quitar su video aunque ya no tenga Agencia',r.status===200 && r.data.presentationVideoId===null);
  r=await call('PUT',`/admin/accounts/professionals/${ids.modDoctor}/presentation-video`,{url:`https://youtu.be/${videoId}`});
  check('el administrador puede cargarlo antes de asignar Agencia',r.status===200 && r.data.presentationVideoId===videoId);

  const plan=(await db.query('SELECT id FROM "SubscriptionPlan" WHERE tier=\'PROFESSIONAL\'')).rows[0];
  const bank=(await db.query('SELECT code FROM "FinancialInstitution" WHERE "isActive"=true AND "supportsPagoMovil"=true LIMIT 1')).rows[0];
  const body={planId:plan.id,amountBs:9000,method:'PAGO_MOVIL',senderBankCode:bank.code,referenceNumber:`TEST-${run}`.toUpperCase(),paidAt:new Date(Date.now()-60000).toISOString(),reason:'Pago bancario revisado durante prueba'};
  const path=`/subscriptions/admin/professionals/${ids.profile}/assign-paid-plan`;
  r=await call('POST',path,{...body,paidAt:new Date(Date.now()+86400000).toISOString()});
  check('rechaza pagos futuros',r.status===400);
  r=await call('POST',path,{...body,amountBs:0});
  check('rechaza importe cero',r.status===400);
  r=await call('POST',path,{...body,periods:13});
  check('rechaza más de 12 períodos',r.status===400);
  r=await call('POST',path,body,patientToken);
  check('cuenta normal no asigna planes',r.status===401 || r.status===403);
  const [first,second]=await Promise.all([call('POST',path,body),call('POST',path,body)]);
  check('dos asignaciones concurrentes: una sola gana',[first.status,second.status].sort().join(',')==='201,409');
  const subscription=(first.status===201?first:second).data;
  check('un solo pago completado para referencia',(await db.query('SELECT count(*)::int n FROM "Payment" WHERE "referenceNumber"=$1',[body.referenceNumber])).rows[0].n===1);
  check('asignación no publica médico',!(await db.query('SELECT "isPublished" FROM "ProfessionalProfile" WHERE id=$1',[ids.profile])).rows[0].isPublished);
  check('el médico recibe el aviso del plan (panel y correo)',await count('SELECT count(*)::int n FROM "Notification" WHERE "userId"=$1 AND type=\'PAID_PLAN_ASSIGNED\'',[ids.doctor])===1
    && await count('SELECT count(*)::int n FROM "MessageLog" WHERE "relatedUserId"=$1 AND template=\'paid_plan_assigned\'',[ids.doctor])===1);
  // Renovación anticipada del mismo plan por 3 meses: se suma al final del período vigente.
  const endBefore=new Date(subscription.currentPeriodEnd);
  r=await call('POST',path,{...body,referenceNumber:`RENEW-${run}`.toUpperCase(),periods:3});
  const cycle=(await db.query('SELECT "billingCycle" FROM "SubscriptionPlan" WHERE id=$1',[plan.id])).rows[0].billingCycle;
  const expectedEnd=new Date(endBefore);
  for (let i=0;i<3;i++) {
    if (cycle==='YEARLY') expectedEnd.setFullYear(expectedEnd.getFullYear()+1);
    else expectedEnd.setMonth(expectedEnd.getMonth()+(cycle==='QUARTERLY'?3:1));
  }
  check('renovar el mismo plan extiende la suscripción vigente sin perder días',r.status===201 && r.data.renewed===true && r.data.id===subscription.id
    && Math.abs(new Date(r.data.currentPeriodEnd).getTime()-expectedEnd.getTime())<60_000);
  check('la renovación queda como una cuota pagada más en la misma suscripción',await count('SELECT count(*)::int n FROM "SubscriptionInstallment" WHERE "subscriptionId"=$1 AND status=\'PAID\'',[subscription.id])===2
    && await count('SELECT count(*)::int n FROM "Subscription" WHERE "professionalId"=$1 AND status=\'ACTIVE\'',[ids.profile])===1);
  r=await call('POST',path,{...body,referenceNumber:`OTHER-${run}`,planId:(await db.query('SELECT id FROM "SubscriptionPlan" WHERE tier=\'PREMIUM\'')).rows[0].id});
  check('plan Premium no evita requisitos documentales',r.status===400);
  await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,mod('DELETE'));
  check('baja conserva suscripción y pago',(await db.query('SELECT count(*)::int n FROM "Subscription" WHERE id=$1',[subscription.id])).rows[0].n===1 && (await db.query('SELECT count(*)::int n FROM "Payment" WHERE "referenceNumber"=$1',[body.referenceNumber])).rows[0].n===1);
  r=await call('POST',path,{...body,referenceNumber:`NO-${run}`});
  check('no asigna plan a cuenta dada de baja',r.status===409);
  check('acciones auditadas',(await db.query('SELECT count(*)::int n FROM "AuditLog" WHERE "userId"=$1 AND action IN (\'ACCOUNT_DELETE\',\'ACCOUNT_SUSPEND\',\'ACCOUNT_RESTORE\',\'PAID_PLAN_ASSIGNED\')',[ids.admin])).rows[0].n>=6);

  // Canal de reclamos: la administración atiende y responde con evidencia.
  const requestId = randomUUID();
  const ticket = `R-${randomBytes(6).toString('hex').slice(0, 8).toUpperCase()}`;
  await db.query('INSERT INTO "LegalRequest" (id,ticket,category,"requesterName","requesterEmail",description,"updatedAt") VALUES ($1,$2,\'MISLEADING_CONTENT\',\'Reclamante\',$3,\'El perfil promete curas garantizadas.\',now())',
    [requestId, ticket, `rec-${run}@test.invalid`]);
  r=await call('GET','/legal-requests/admin?status=OPEN');
  check('la administración ve las solicitudes abiertas',r.status===200 && r.data.items.some(x=>x.id===requestId) && r.data.open>=1);
  r=await call('PATCH',`/legal-requests/admin/${requestId}`,{status:'RESOLVED'});
  check('resolver exige una respuesta para el solicitante',r.status===400);
  r=await call('PATCH',`/legal-requests/admin/${requestId}`,{status:'RESOLVED',resolution:'Retiramos la afirmación engañosa del perfil y advertimos al profesional.'});
  check('resolver avisa al solicitante y queda auditado',r.status===200 && r.data.resolvedAt
    && await count('SELECT count(*)::int n FROM "MessageLog" WHERE recipient=$1 AND template=\'legal_request_updated\'',[`rec-${run}@test.invalid`])===1
    && await count('SELECT count(*)::int n FROM "AuditLog" WHERE "userId"=$1 AND action=\'LEGAL_REQUEST_UPDATED\' AND "resourceId"=$2',[ids.admin,requestId])===1);
  r=await call('POST','/legal-requests/lookup',{ticket,email:`rec-${run}@test.invalid`},null);
  check('el solicitante consulta la respuesta con su número',r.status===200 && r.data.status==='RESOLVED' && r.data.resolution.startsWith('Retiramos'));

  // Eliminación definitiva: solo SUPERADMIN, solo cuentas suspendidas o dadas de baja, con confirmación escrita.
  r=await call('PATCH',`/admin/accounts/professionals/${ids.modDoctor}`,mod('DELETE'));
  check('dar de baja al médico verificado',r.status===200);
  r=await call('GET',`/admin/accounts/professionals?search=${run}`);
  check('la baja sigue en la lista sin filtro y no cuenta como suspendida',r.status===200 && !!r.data.items.find(x=>x.id===ids.modDoctor)?.deletedAt
    && !(await call('GET',`/admin/accounts/professionals?status=SUSPENDED&search=${run}`)).data.items.some(x=>x.id===ids.modDoctor));
  r=await login(modEmail, modPassword);
  check('con la contraseña correcta explica la baja',r.status===403 && r.data?.code==='ACCOUNT_DELETED');
  check('ADMIN no puede eliminar definitivamente',(await call('POST',`/admin/accounts/professionals/${ids.modDoctor}/purge`,purgeBody)).status===403);
  check('sin escribir ELIMINAR → 400',(await call('POST',`/admin/accounts/professionals/${ids.modDoctor}/purge`,{...purgeBody,confirm:'eliminar'},superToken)).status===400);
  check('pacientes: eliminar exige la bóveda',(await call('POST',`/patients/admin/accounts/${ids.outsider}/purge`,purgeBody,superToken)).status===403);
  check('una cuenta activa no se elimina: primero se suspende o se da de baja',(await call('POST',`/patients/admin/accounts/${ids.outsider}/purge`,purgeBody,superToken,superVault)).status===409);
  // Sus apariciones en búsquedas (estadística del médico) también se borran.
  await db.query('INSERT INTO "SearchAppearance" (id,"professionalId",day,count) VALUES ($1,$2,current_date,3)',[randomUUID(),ids.modProfile]);
  r=await call('POST',`/admin/accounts/professionals/${ids.modDoctor}/purge`,purgeBody,superToken);
  const purged=(await db.query('SELECT u.email,u."purgedAt",u."isActive",p."firstName",p."publicCode",p.bio,p."photoUrl",p."presentationVideoId",p."isPublished" FROM "User" u JOIN "ProfessionalProfile" p ON p."userId"=u.id WHERE u.id=$1',[ids.modDoctor])).rows[0];
  check('médico eliminado: sin correo, nombre, código, biografía, foto ni video',r.status===200 && purged.email.startsWith('eliminado-') && purged.purgedAt && !purged.isActive
    && purged.firstName==='Cuenta' && purged.publicCode===null && purged.bio===null && purged.photoUrl===null && purged.presentationVideoId===null && !purged.isPublished);
  check('se borran sus documentos y sus apariciones en búsquedas',await count('SELECT count(*)::int n FROM "ProfessionalDocument" WHERE "professionalId"=$1',[ids.modProfile])===0
    && await count('SELECT count(*)::int n FROM "SearchAppearance" WHERE "professionalId"=$1',[ids.modProfile])===0);
  check('el correo queda anonimizado en el registro de envíos',await count('SELECT count(*)::int n FROM "MessageLog" WHERE recipient=$1',[modEmail])===0
    && await count('SELECT count(*)::int n FROM "MessageLog" WHERE "relatedUserId"=$1 AND template=\'account_purged\'',[ids.modDoctor])===1);
  check('ya no inicia sesión',(await login(modEmail, modPassword)).status===401);
  r=await call('GET',`/admin/accounts/professionals?status=DELETED&search=${run}`);
  check('ya no aparece en la gestión de cuentas',r.status===200 && !r.data.items.some(x=>x.id===ids.modDoctor));
  check('no se elimina dos veces',(await call('POST',`/admin/accounts/professionals/${ids.modDoctor}/purge`,purgeBody,superToken)).status===404);
  // El correo queda libre: vuelve como una cuenta nueva, que también se puede eliminar estando solo suspendida.
  r=await publicPost('/auth/register',{email:modEmail,password:modPassword,role:'PROFESSIONAL',firstName:'Marta',lastName:'Regresa',acceptLegal:true,acceptProfessionalTerms:true});
  const again=(await db.query('SELECT id FROM "User" WHERE email=$1',[modEmail])).rows[0];
  check('el médico eliminado se registra de nuevo con el mismo correo, como cuenta nueva',r.status===201 && !!again && again.id!==ids.modDoctor);
  check('suspender la cuenta nueva',(await call('PATCH',`/admin/accounts/professionals/${again.id}`,mod('SUSPEND'))).status===200);
  r=await call('POST',`/admin/accounts/professionals/${again.id}/purge`,purgeBody,superToken);
  const purgedAgain=(await db.query('SELECT email,"purgedAt","deletedAt","isActive" FROM "User" WHERE id=$1',[again.id])).rows[0];
  check('una cuenta suspendida se elimina sin pasar por la baja',r.status===200 && purgedAgain.email.startsWith('eliminado-')
    && !!purgedAgain.purgedAt && !!purgedAgain.deletedAt && !purgedAgain.isActive);
  check('la lista de médicos ya no muestra las cuentas eliminadas',!(await call('GET','/professionals/admin/list?limit=50')).data.items.some(x=>x.user.id===again.id || x.user.id===ids.modDoctor));
  r=await call('POST',`/admin/accounts/professionals/${ids.doctor}/purge`,purgeBody,superToken);
  check('médico con pagos: se eliminan sus datos y se conservan pagos, suscripción y autorización revocada',r.status===200
    && await count('SELECT count(*)::int n FROM "Payment" WHERE "referenceNumber"=$1',[body.referenceNumber])===1
    && await count('SELECT count(*)::int n FROM "Subscription" WHERE id=$1 AND status=\'CANCELED\'',[subscription.id])===1
    && !!(await db.query('SELECT "revokedAt" FROM "PatientDataGrant" WHERE id=$1',[grantsId])).rows[0]?.revokedAt);
  r=await call('GET','/admin/stats',null,superToken);
  check('el resumen no cuenta como médicos los registros anónimos de cuentas eliminadas',r.status===200
    && r.data.totalProfessionals===await count('SELECT count(*)::int n FROM "ProfessionalProfile" p JOIN "User" u ON u.id=p."userId" WHERE u."purgedAt" IS NULL'));
  r=await call('PATCH',`/patients/admin/accounts/${ids.patient}`,mod('DELETE'),adminToken,vaultCookie);
  check('dar de baja al paciente',r.status===200);
  r=await call('POST',`/patients/admin/accounts/${ids.patient}/purge`,purgeBody,superToken,superVault);
  const shell=(await db.query('SELECT "userId","firstName","cedulaLookup","phoneLookup","shareCodeLookup","patientCode" FROM "PatientProfile" WHERE id=$1',[ids.patientProfile])).rows[0];
  check('paciente eliminado: la cuenta se borra',r.status===200 && await count('SELECT count(*)::int n FROM "User" WHERE id=$1',[ids.patient])===0);
  check('su ficha queda solo con el código (tenía una autorización a un médico)',shell && shell.userId===null && shell.firstName===null
    && shell.cedulaLookup===null && shell.phoneLookup===null && shell.shareCodeLookup===null && shell.patientCode===`TEST-${run}`);
  check('eliminaciones auditadas',await count('SELECT count(*)::int n FROM "AuditLog" WHERE "userId"=$1 AND action=\'ACCOUNT_PURGE\'',[ids.superadmin])===4);
  r=await call('GET','/admin/stats',null,superToken);
  check('el resumen cuenta las cuentas de paciente, sin la eliminada',r.status===200
    && r.data.totalPatients===await count('SELECT count(*)::int n FROM "User" WHERE role=\'USER\' AND "purgedAt" IS NULL')
    && await count('SELECT count(*)::int n FROM "User" WHERE id=$1',[ids.patient])===0);
  console.log(`PASS: ${checks} comprobaciones administrativas`);
} finally { await db.end(); }
