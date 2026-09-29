// Ejecutar solo contra una base de pruebas desechable, nunca contra producción.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
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
const ids = { admin: randomUUID(), doctor: randomUUID(), patient: randomUUID(), outsider: randomUUID(), profile: randomUUID(), patientProfile: randomUUID() };
const token = (id, role, tv = 0) => jwt.sign({ sub: id, email: `${id}@test.invalid`, role, tv }, { expiresIn: '10m' });
const adminToken = token(ids.admin, 'ADMIN');
const doctorToken = token(ids.doctor, 'PROFESSIONAL');
const patientToken = token(ids.patient, 'USER');
let checks = 0;
async function call(method, path, body, auth = adminToken, cookie) {
  const res = await fetch(API + path, { method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
}
function check(label, condition) { assert.ok(condition, label); console.log('PASS', label); checks++; }
const mod = (action) => ({ action, reason: 'Prueba administrativa controlada' });
try {
  for (const [key, role] of [['admin','ADMIN'], ['doctor','PROFESSIONAL'], ['patient','USER'], ['outsider','USER']]) {
    await db.query('INSERT INTO "User" (id,email,"passwordHash",role,"isEmailVerified","updatedAt") VALUES ($1,$2,$3,$4,true,now())',
      [ids[key], `${key}-${run}@test.invalid`, passwordHash, role]);
  }
  await db.query('INSERT INTO "ProfessionalProfile" (id,"userId","firstName","lastName",slug,"verificationStatus","isPublished","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,true,now())',
    [ids.profile,ids.doctor,'Doctora','Prueba',`doctor-${run}`,'VERIFIED']);
  await db.query('INSERT INTO "PatientProfile" (id,"userId","patientCode","firstName","lastName","updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
    [ids.patientProfile,ids.patient,`TEST-${run}`,'Paciente','Protegido']);
  let r = await call('GET','/admin/accounts/professionals',null,doctorToken);
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
  r = await call('PATCH',`/patients/admin/accounts/${ids.admin}`,mod('DELETE'),adminToken,vaultCookie);
  check('no se permite borrar al administrador por ruta de pacientes',r.status===404);
  r = await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,{action:'DELETE',reason:'  '});
  check('motivo vacío rechazado',r.status===400);
  const grantsId=randomUUID();
  await db.query('INSERT INTO "PatientDataGrant" (id,"patientId","professionalId",scopes,"expiresAt","consentVersion") VALUES ($1,$2,$3,ARRAY[\'HEALTH\']::"PatientDataScope"[],now()+interval \'1 day\',\'test\')',[grantsId,ids.patientProfile,ids.profile]);
  await db.query('INSERT INTO "RefreshToken" (id,"userId","tokenHash","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 day\')',[randomUUID(),ids.patient,run]);
  r=await call('PATCH',`/patients/admin/accounts/${ids.patient}`,mod('DELETE'),adminToken,vaultCookie);
  check('baja de paciente reversible',r.status===200 && !!r.data.deletedAt);
  const patientState=(await db.query('SELECT u."isActive",u."deletedAt",p."shareCodeLookup",p."shareScopes" FROM "User" u JOIN "PatientProfile" p ON p."userId"=u.id WHERE u.id=$1',[ids.patient])).rows[0];
  check('baja conserva ficha, bloquea cuenta y código',!patientState.isActive && patientState.deletedAt && !patientState.shareCodeLookup && (patientState.shareScopes === '{}' || patientState.shareScopes.length === 0));
  check('baja revoca consentimiento',!!(await db.query('SELECT "revokedAt" FROM "PatientDataGrant" WHERE id=$1',[grantsId])).rows[0].revokedAt);
  check('baja revoca refresh',!!(await db.query('SELECT "revokedAt" FROM "RefreshToken" WHERE "userId"=$1',[ids.patient])).rows[0].revokedAt);
  check('token previo de paciente deja de servir',(await call('GET','/auth/me',null,patientToken)).status===401);
  r=await call('PATCH',`/patients/admin/accounts/${ids.patient}`,mod('RESTORE'),adminToken,vaultCookie);
  check('restauración no restaura sesiones antiguas',r.status===200 && (await call('GET','/auth/me',null,patientToken)).status===401);
  check('restauración no restaura consentimiento',!!(await db.query('SELECT "revokedAt" FROM "PatientDataGrant" WHERE id=$1',[grantsId])).rows[0].revokedAt);
  r=await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,mod('SUSPEND'));
  check('suspensión de médico bloquea sesión',r.status===200 && (await call('GET','/auth/me',null,doctorToken)).status===401);
  check('médico suspendido sale del directorio',!(await db.query('SELECT "isPublished" FROM "ProfessionalProfile" WHERE id=$1',[ids.profile])).rows[0].isPublished);
  r = await call('PATCH',`/professionals/admin/${ids.profile}/suspend`,{suspended:false});
  check('el control anterior no reactiva una cuenta suspendida',r.status === 403);
  await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,mod('RESTORE'));
  check('reactivar no publica ni verifica automáticamente',(await db.query('SELECT "verificationStatus","isPublished" FROM "ProfessionalProfile" WHERE id=$1',[ids.profile])).rows[0].verificationStatus==='IN_REVIEW');
  const plan=(await db.query('SELECT id FROM "SubscriptionPlan" WHERE tier=\'PROFESSIONAL\'')).rows[0];
  const bank=(await db.query('SELECT code FROM "FinancialInstitution" WHERE "isActive"=true AND "supportsPagoMovil"=true LIMIT 1')).rows[0];
  const body={planId:plan.id,amountBs:9000,method:'PAGO_MOVIL',senderBankCode:bank.code,referenceNumber:`TEST-${run}`.toUpperCase(),paidAt:new Date(Date.now()-60000).toISOString(),reason:'Pago bancario revisado durante prueba'};
  const path=`/subscriptions/admin/professionals/${ids.profile}/assign-paid-plan`;
  r=await call('POST',path,{...body,paidAt:new Date(Date.now()+86400000).toISOString()});
  check('rechaza pagos futuros',r.status===400);
  r=await call('POST',path,{...body,amountBs:0});
  check('rechaza importe cero',r.status===400);
  r=await call('POST',path,body,patientToken);
  check('cuenta normal no asigna planes',r.status===401 || r.status===403);
  const [first,second]=await Promise.all([call('POST',path,body),call('POST',path,body)]);
  check('dos asignaciones concurrentes: una sola gana',[first.status,second.status].sort().join(',')==='201,409');
  const subscription=(first.status===201?first:second).data;
  check('un solo pago completado para referencia',(await db.query('SELECT count(*)::int n FROM "Payment" WHERE "referenceNumber"=$1',[body.referenceNumber])).rows[0].n===1);
  check('asignación no publica médico',!(await db.query('SELECT "isPublished" FROM "ProfessionalProfile" WHERE id=$1',[ids.profile])).rows[0].isPublished);
  r=await call('POST',path,{...body,referenceNumber:`OTHER-${run}`,planId:(await db.query('SELECT id FROM "SubscriptionPlan" WHERE tier=\'PREMIUM\'')).rows[0].id});
  check('plan Premium no evita requisitos documentales',r.status===400);
  await call('PATCH',`/admin/accounts/professionals/${ids.doctor}`,mod('DELETE'));
  check('baja conserva suscripción y pago',(await db.query('SELECT count(*)::int n FROM "Subscription" WHERE id=$1',[subscription.id])).rows[0].n===1 && (await db.query('SELECT count(*)::int n FROM "Payment" WHERE "referenceNumber"=$1',[body.referenceNumber])).rows[0].n===1);
  r=await call('POST',path,{...body,referenceNumber:`NO-${run}`});
  check('no asigna plan a cuenta dada de baja',r.status===409);
  check('acciones auditadas',(await db.query('SELECT count(*)::int n FROM "AuditLog" WHERE "userId"=$1 AND action IN (\'ACCOUNT_DELETE\',\'ACCOUNT_SUSPEND\',\'ACCOUNT_RESTORE\',\'PAID_PLAN_ASSIGNED\')',[ids.admin])).rows[0].n>=6);
  console.log(`PASS: ${checks} comprobaciones administrativas`);
} finally { await db.end(); }
