// Canal en tiempo real (ACT-0049) de punta a punta: conexiones Socket.IO reales
// contra la API y cambios hechos con SQL directo (los disparadores de la base
// deben avisar venga de donde venga el cambio).
// Ejecutar solo contra una base de pruebas desechable, nunca contra producción.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { JwtService } from '@nestjs/jwt';
import { io } from 'socket.io-client';

const databaseName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (process.env.NODE_ENV !== 'test' || !['gmm_admin_test', 'gmm_ci'].includes(databaseName)) {
  throw new Error('Esta suite exige NODE_ENV=test y una base gmm_admin_test o gmm_ci');
}
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';
const ORIGIN = new URL(API).origin;
const PATH = `${new URL(API).pathname.replace(/\/$/, '')}/realtime`;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const run = randomUUID().slice(0, 8);
const id = () => randomUUID();
const ids = {
  doctor: id(), doctorProfile: id(), hidden: id(), hiddenProfile: id(),
  patient: id(), patientProfile: id(), other: id(), otherProfile: id(), admin: id(),
};
const token = (userId, role, tv = 0) => jwt.sign({ sub: userId, email: `${userId}@test.invalid`, role, tv }, { expiresIn: '10m' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let checks = 0;
function check(label, condition) { assert.ok(condition, label); console.log('PASS', label); checks++; }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(accessToken) {
  return io(ORIGIN, { path: PATH, transports: ['websocket'], auth: accessToken ? { token: accessToken } : {}, reconnection: false, forceNew: true });
}
/** Espera «ready» (conectado y en sus salas) o devuelve el error de conexión. */
function opened(socket) {
  return new Promise((resolve) => {
    socket.once('ready', (info) => resolve({ ok: true, info }));
    socket.once('connect_error', (error) => resolve({ ok: false, error: error.message }));
  });
}
function inbox(socket) {
  const messages = [];
  socket.on('sync', (message) => messages.push(message));
  return messages;
}
const topicsOf = (messages) => new Set(messages.flatMap((m) => m.topics));
async function waitFor(predicate, ms = 5000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (predicate()) return true;
    await sleep(50);
  }
  return predicate();
}
const watch = (socket, professionalId) => new Promise((resolve) => socket.emit('watch', { professionalId }, (r) => resolve(r?.ok === true)));

const sockets = [];
try {
  const user = (userId, role) => db.query(
    'INSERT INTO "User" (id,email,"passwordHash",role,"isEmailVerified","updatedAt") VALUES ($1,$2,\'test-fixture-only\',$3,true,now())',
    [userId, `rt-${role.toLowerCase()}-${userId.slice(0, 8)}-${run}@test.invalid`, role],
  );
  await user(ids.doctor, 'PROFESSIONAL');
  await user(ids.hidden, 'PROFESSIONAL');
  await user(ids.patient, 'USER');
  await user(ids.other, 'USER');
  await user(ids.admin, 'ADMIN');
  const profile = (profileId, userId, published) => db.query(
    'INSERT INTO "ProfessionalProfile" (id,"userId","firstName","lastName",slug,"verificationStatus","isPublished","updatedAt") VALUES ($1,$2,\'Tiempo\',\'Real\',$3,\'VERIFIED\',$4,now())',
    [profileId, userId, `rt-${profileId.slice(0, 8)}-${run}`, published],
  );
  await profile(ids.doctorProfile, ids.doctor, true);
  await profile(ids.hiddenProfile, ids.hidden, false);
  const patient = (profileId, userId) => db.query(
    'INSERT INTO "PatientProfile" (id,"userId","patientCode","firstName","lastName","updatedAt") VALUES ($1,$2,$3,\'Paciente\',\'Prueba\',now())',
    [profileId, userId, `RT-${profileId.slice(0, 6)}-${run}`],
  );
  await patient(ids.patientProfile, ids.patient);
  await patient(ids.otherProfile, ids.other);

  // 1. Conexión
  const intruder = connect('no-es-un-token');
  sockets.push(intruder);
  const rejected = await opened(intruder);
  check('un token inválido no entra al canal', !rejected.ok && rejected.error === 'unauthorized');

  const doctor = connect(token(ids.doctor, 'PROFESSIONAL'));
  const patientSocket = connect(token(ids.patient, 'USER'));
  const other = connect(token(ids.other, 'USER'));
  const admin = connect(token(ids.admin, 'ADMIN'));
  const visitor = connect();
  sockets.push(doctor, patientSocket, other, admin, visitor);
  const [d, p, o, a, v] = await Promise.all([doctor, patientSocket, other, admin, visitor].map(opened));
  check('médico, pacientes y administración entran con su sesión', d.ok && p.ok && o.ok && a.ok && d.info.authenticated && p.info.authenticated);
  check('un visitante sin sesión también entra, sin salas privadas', v.ok && v.info.authenticated === false);

  const inboxes = { doctor: inbox(doctor), patient: inbox(patientSocket), other: inbox(other), admin: inbox(admin), visitor: inbox(visitor) };

  // 2. Horarios públicos
  check('el visitante puede mirar los horarios de un médico publicado', await watch(visitor, ids.doctorProfile));
  check('pero no los de uno sin publicar', !(await watch(visitor, ids.hiddenProfile)));
  check('ni con un identificador inválido', !(await watch(visitor, 'no-es-un-id')));

  // 3. Un aviso nuevo (SQL directo): solo a su dueño, con el identificador de la fila
  const noticeId = id();
  await db.query('INSERT INTO "Notification" (id,"userId",type,title,content) VALUES ($1,$2,\'TEST\',\'Prueba\',\'Contenido privado\')', [noticeId, ids.patient]);
  check('el paciente se entera de su aviso nuevo', await waitFor(() => topicsOf(inboxes.patient).has('notifications')));
  const noticeMessage = inboxes.patient.find((m) => m.topics.includes('notifications'));
  check('el mensaje trae el tema y el identificador, sin contenido', noticeMessage.refs.notifications.includes(noticeId)
    && Object.keys(noticeMessage).every((k) => ['topics', 'refs'].includes(k)) && !JSON.stringify(noticeMessage).includes('privado'));

  // 4. Una cita: médico, paciente y quien mira los horarios; nadie más
  const appointmentId = id();
  await db.query(
    'INSERT INTO "Appointment" (id,"professionalId","patientId","startsAt","endsAt","updatedAt") VALUES ($1,$2,$3,now() + interval \'3 days\',now() + interval \'3 days 30 minutes\',now())',
    [appointmentId, ids.doctorProfile, ids.patientProfile],
  );
  check('el médico ve la cita nueva en su agenda', await waitFor(() => topicsOf(inboxes.doctor).has('appointments')));
  check('el paciente también', await waitFor(() => topicsOf(inboxes.patient).has('appointments')));
  check('quien mira la ficha se entera de que cambiaron los horarios, sin el id de la cita', await waitFor(() => topicsOf(inboxes.visitor).has('availability'))
    && !JSON.stringify(inboxes.visitor).includes(appointmentId));
  await sleep(800);
  check('otro paciente no recibe nada de citas ajenas ni de avisos ajenos', !topicsOf(inboxes.other).has('appointments') && !topicsOf(inboxes.other).has('notifications'));
  check('el médico no recibe los avisos del paciente', !topicsOf(inboxes.doctor).has('notifications'));

  // 5. Ruido: el puntaje del directorio no avisa; un cambio del perfil, sí
  inboxes.doctor.length = 0;
  inboxes.visitor.length = 0;
  await db.query('UPDATE "ProfessionalProfile" SET "directoryScore" = "directoryScore" + 1, "updatedAt" = now() WHERE id = $1', [ids.doctorProfile]);
  await sleep(1200);
  check('recalcular el puntaje del directorio no avisa a nadie', !topicsOf(inboxes.doctor).has('profile') && !topicsOf(inboxes.visitor).has('directory'));
  await db.query('UPDATE "ProfessionalProfile" SET bio = \'Nueva biografía de prueba\', "updatedAt" = now() WHERE id = $1', [ids.doctorProfile]);
  check('editar el perfil avisa al médico y actualiza el directorio público', await waitFor(() => topicsOf(inboxes.doctor).has('profile'))
    && await waitFor(() => topicsOf(inboxes.visitor).has('directory')));

  // 6. Administración: un documento nuevo por revisar
  await db.query(
    'INSERT INTO "ProfessionalDocument" (id,"professionalId",type,"fileKey","originalFileName","mimeType","fileSizeBytes",status,"updatedAt") VALUES ($1,$2,\'RIF\',\'documents/rt.pdf\',\'rt.pdf\',\'application/pdf\',1000,\'PENDING\',now())',
    [id(), ids.doctorProfile],
  );
  check('administración ve el documento nuevo en su cola', await waitFor(() => topicsOf(inboxes.admin).has('documents')));
  check('y el médico, en sus documentos', await waitFor(() => topicsOf(inboxes.doctor).has('documents')));

  // 7. Sesión revocada (cambio de contraseña, cerrar sesiones, suspensión…)
  const revoked = new Promise((resolve) => {
    let reason = null;
    patientSocket.once('session', (message) => { reason = message?.reason; });
    patientSocket.once('disconnect', () => resolve(reason));
  });
  await db.query('UPDATE "User" SET "tokenVersion" = "tokenVersion" + 1 WHERE id = $1', [ids.patient]);
  const reason = await Promise.race([revoked, sleep(5000).then(() => 'sin-respuesta')]);
  check('cerrar las sesiones de la cuenta corta también su canal', reason === 'revoked');
  const stale = connect(token(ids.patient, 'USER', 0));
  sockets.push(stale);
  const staleResult = await opened(stale);
  check('el token anterior ya no entra', !staleResult.ok && staleResult.error === 'unauthorized');
  const fresh = connect(token(ids.patient, 'USER', 1));
  sockets.push(fresh);
  check('con la sesión nueva vuelve a entrar', (await opened(fresh)).ok);

  // 8. Bandeja: todo lo de esta prueba quedó repartido
  await sleep(1000);
  const pending = (await db.query('SELECT count(*)::int AS n FROM "RealtimeEvent" WHERE "dispatchedAt" IS NULL AND "createdAt" < now() - interval \'2 seconds\'')).rows[0].n;
  check('la bandeja no deja eventos sin repartir', pending === 0);
  const refs = inboxes.doctor.flatMap((m) => Object.values(m.refs ?? {}).flat());
  check('los identificadores enviados son solo UUID', refs.length > 0 && refs.every((ref) => UUID.test(ref)));

  console.log(`PASS: ${checks} comprobaciones del canal en tiempo real`);
} finally {
  for (const socket of sockets) socket.close();
  await db.end();
}
