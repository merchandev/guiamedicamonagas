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
// El inicio de sesión tiene límite por minuto: si la suite anterior lo agotó, se espera una vez.
async function login(email, password) {
  let r = await call('POST', '/auth/login', { email, password }, null);
  if (r.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    r = await call('POST', '/auth/login', { email, password }, null);
  }
  return r;
}
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
  const modPassword = 'Prueba12345x';
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
  await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,mod('RESTORE'));
  check('reactivar sin documentos: queda en revisión y fuera del directorio',(await db.query('SELECT "verificationStatus","isPublished" FROM "ProfessionalProfile" WHERE id=$1',[ids.profile])).rows[0].verificationStatus==='IN_REVIEW');

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
  check('inicia sesión tras reactivar',(await login(modEmail, modPassword)).status===200);

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

  // Eliminación definitiva: solo SUPERADMIN, solo cuentas dadas de baja, con confirmación escrita.
  r=await call('PATCH',`/admin/accounts/professionals/${ids.modDoctor}`,mod('DELETE'));
  check('dar de baja al médico verificado',r.status===200);
  r=await login(modEmail, modPassword);
  check('con la contraseña correcta explica la baja',r.status===403 && r.data?.code==='ACCOUNT_DELETED');
  check('ADMIN no puede eliminar definitivamente',(await call('POST',`/admin/accounts/professionals/${ids.modDoctor}/purge`,purgeBody)).status===403);
  check('sin escribir ELIMINAR → 400',(await call('POST',`/admin/accounts/professionals/${ids.modDoctor}/purge`,{...purgeBody,confirm:'eliminar'},superToken)).status===400);
  check('pacientes: eliminar exige la bóveda',(await call('POST',`/patients/admin/accounts/${ids.outsider}/purge`,purgeBody,superToken)).status===403);
  check('una cuenta activa no se elimina: primero se da de baja',(await call('POST',`/patients/admin/accounts/${ids.outsider}/purge`,purgeBody,superToken,superVault)).status===409);
  r=await call('POST',`/admin/accounts/professionals/${ids.modDoctor}/purge`,purgeBody,superToken);
  const purged=(await db.query('SELECT u.email,u."purgedAt",u."isActive",p."firstName",p."publicCode",p.bio,p."photoUrl",p."isPublished" FROM "User" u JOIN "ProfessionalProfile" p ON p."userId"=u.id WHERE u.id=$1',[ids.modDoctor])).rows[0];
  check('médico eliminado: sin correo, nombre, código, biografía ni foto',r.status===200 && purged.email.startsWith('eliminado-') && purged.purgedAt && !purged.isActive
    && purged.firstName==='Cuenta' && purged.publicCode===null && purged.bio===null && purged.photoUrl===null && !purged.isPublished);
  check('se borran sus documentos',await count('SELECT count(*)::int n FROM "ProfessionalDocument" WHERE "professionalId"=$1',[ids.modProfile])===0);
  check('el correo queda anonimizado en el registro de envíos',await count('SELECT count(*)::int n FROM "MessageLog" WHERE recipient=$1',[modEmail])===0
    && await count('SELECT count(*)::int n FROM "MessageLog" WHERE "relatedUserId"=$1 AND template=\'account_purged\'',[ids.modDoctor])===1);
  check('ya no inicia sesión',(await login(modEmail, modPassword)).status===401);
  r=await call('GET',`/admin/accounts/professionals?status=DELETED&search=${run}`);
  check('ya no aparece en la gestión de cuentas',r.status===200 && !r.data.items.some(x=>x.id===ids.modDoctor));
  check('no se elimina dos veces',(await call('POST',`/admin/accounts/professionals/${ids.modDoctor}/purge`,purgeBody,superToken)).status===404);
  r=await call('POST',`/admin/accounts/professionals/${ids.doctor}/purge`,purgeBody,superToken);
  check('médico con pagos: se eliminan sus datos y se conservan pagos, suscripción y autorización revocada',r.status===200
    && await count('SELECT count(*)::int n FROM "Payment" WHERE "referenceNumber"=$1',[body.referenceNumber])===1
    && await count('SELECT count(*)::int n FROM "Subscription" WHERE id=$1 AND status=\'CANCELED\'',[subscription.id])===1
    && !!(await db.query('SELECT "revokedAt" FROM "PatientDataGrant" WHERE id=$1',[grantsId])).rows[0]?.revokedAt);
  r=await call('PATCH',`/patients/admin/accounts/${ids.patient}`,mod('DELETE'),adminToken,vaultCookie);
  check('dar de baja al paciente',r.status===200);
  r=await call('POST',`/patients/admin/accounts/${ids.patient}/purge`,purgeBody,superToken,superVault);
  const shell=(await db.query('SELECT "userId","firstName","cedulaLookup","phoneLookup","shareCodeLookup","patientCode" FROM "PatientProfile" WHERE id=$1',[ids.patientProfile])).rows[0];
  check('paciente eliminado: la cuenta se borra',r.status===200 && await count('SELECT count(*)::int n FROM "User" WHERE id=$1',[ids.patient])===0);
  check('su ficha queda solo con el código (tenía una autorización a un médico)',shell && shell.userId===null && shell.firstName===null
    && shell.cedulaLookup===null && shell.phoneLookup===null && shell.shareCodeLookup===null && shell.patientCode===`TEST-${run}`);
  check('eliminaciones auditadas',await count('SELECT count(*)::int n FROM "AuditLog" WHERE "userId"=$1 AND action=\'ACCOUNT_PURGE\'',[ids.superadmin])===3);
  console.log(`PASS: ${checks} comprobaciones administrativas`);
} finally { await db.end(); }
