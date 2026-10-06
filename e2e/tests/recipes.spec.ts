// Récipes digitales: el médico verificado arma su talonario y emite; el récipe
// llega a «Mis récipes» del paciente de su directorio, se agrega con el código
// solo si la cédula es la de la cuenta, y cualquiera con el código (la
// farmacia) lo verifica. Los PDF y las subidas necesitan almacenamiento (CI);
// el correo, Mailpit (CI).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  API,
  api,
  createPatient,
  createPrescriber,
  createPublishedDoctor,
  HAS_STORAGE,
  latestMail,
  MAILPIT,
  registeredByCode,
  signIn,
  spreadRateLimits,
  sql,
  uploadPadImage,
} from './support';

/** Hoja en blanco (40×20): sin trazos no hay firma. */
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAMAAADImI+JAAAAA1BMVEX///+nxBvIAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQoz2NgGAWjYBSQAgADNAABOcjLQwAAAABJRU5ErkJggg==',
  'base64',
);

interface Notice {
  type: string;
  title: string;
}

const notices = async (token: string) => (await api('GET', '/notifications?limit=50', undefined, token)).data.items as Notice[];

const item = (overrides: Record<string, unknown> = {}) => ({
  activeIngredient: 'Amoxicilina',
  concentration: '500 mg',
  pharmaceuticalForm: 'Cápsulas',
  route: 'oral',
  dose: '1 cápsula cada 8 horas',
  duration: '7 días',
  quantity: '21 cápsulas',
  nonSubstitutable: false,
  ...overrides,
});

const issueBody = (cedula: string, overrides: Record<string, unknown> = {}) => ({
  patientName: 'Pedro Prueba',
  patientCedula: cedula,
  patientBirthYear: 1985,
  items: [item()],
  validityDays: 30,
  ...overrides,
});

async function pdfFrom(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, init);
  return { status: res.status, type: res.headers.get('content-type') ?? '', body: Buffer.from(await res.arrayBuffer()) };
}

test('el médico emite desde su panel, el paciente lo ve en «Mis récipes», la farmacia lo verifica y el médico lo anula', async ({ browser }) => {
  const doctor = await createPrescriber();
  const patient = await createPatient();
  await registeredByCode(doctor, patient);

  // Médico: nuevo récipe para un paciente de su directorio.
  const doctorContext = await browser.newContext();
  await spreadRateLimits(doctorContext);
  await signIn(doctorContext, doctor.email);
  const page = await doctorContext.newPage();
  await page.goto('/dashboard/recipes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Récipes');
  await page.getByRole('link', { name: 'Nuevo récipe' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nuevo récipe');
  await page.getByRole('combobox', { name: /paciente de tu directorio/ }).click();
  await page.getByRole('option', { name: new RegExp(patient.lastName, 'i') }).click();
  await page.getByLabel('Nombre y apellidos').fill(`Pedro ${patient.lastName}`);
  await page.getByLabel(/^Cédula/).fill(patient.cedula);
  await page.getByLabel('Año de nacimiento').fill('1985');
  await page.getByLabel('Principio activo (DCI)').fill('Amoxicilina');
  await page.getByLabel('Concentración').fill('500 mg');
  await page.getByLabel('Forma farmacéutica').fill('Cápsulas');
  await page.getByLabel('Dosis').fill('1 cápsula cada 8 horas');
  await page.getByLabel('Duración del tratamiento').fill('7 días');
  await page.getByLabel('Indicaciones generales al paciente (opcional)').fill('Reposo relativo y abundante agua.');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Emitir récipe' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Récipe N° 000001/);
  const id = page.url().split('/').pop()!;
  const detail = await api('GET', `/prescriptions/${id}`, undefined, doctor.token);
  expect(detail.data).toMatchObject({ number: 1, status: 'VALID', deliveredTo: expect.stringMatching(/^GMM-/) });
  const code = detail.data.code as string;
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  expect(detail.data.verifyUrl).toMatch(new RegExp(`/recipe#${code}$`));
  await expect(page.getByText(code).first()).toBeVisible();

  // El paciente recibe el aviso (sin medicamentos) y lo ve en su panel.
  const notice = (await notices(patient.token)).find((n) => n.type === 'PRESCRIPTION_RECEIVED');
  expect(notice?.title).toBe(`Récipe nuevo de Dr(a). Diana ${doctor.lastName}`);
  expect(JSON.stringify(notice)).not.toContain('Amoxicilina');
  const patientContext = await browser.newContext();
  await spreadRateLimits(patientContext);
  await signIn(patientContext, patient.email);
  const patientPage = await patientContext.newPage();
  await patientPage.goto('/paciente/recipes');
  await expect(patientPage.getByRole('heading', { level: 1 })).toHaveText('Mis récipes');
  await patientPage.getByRole('link', { name: new RegExp(`N° 000001`) }).click();
  await expect(patientPage.getByRole('heading', { level: 1 })).toHaveText('Récipe N° 000001');
  await expect(patientPage.getByRole('button', { name: 'Descargar PDF' })).toBeVisible();
  await expect(patientPage.getByRole('link', { name: 'Enviar por WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=.*recipe%23/);
  const { violations } = await new AxeBuilder({ page: patientPage }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  // La farmacia, sin sesión, lo verifica con el enlace del QR.
  const pharmacy = await browser.newContext();
  await spreadRateLimits(pharmacy);
  const check = await pharmacy.newPage();
  await check.goto(`/recipe#${code}`);
  await expect(check.locator('main').getByText('Récipe N° 000001: Vigente')).toBeVisible();
  await expect(check.locator('main')).toContainText('Es auténtico y está vigente.');
  await expect(check.locator('main')).toContainText(`Pedro ${patient.lastName}`);

  // El médico lo anula: la verificación lo muestra y el paciente recibe el aviso.
  await page.getByLabel('Motivo').fill('Dosis equivocada');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Anular récipe' }).click();
  await expect(page.locator('main').getByText('Anulaste el récipe.', { exact: false })).toBeVisible();
  await check.reload();
  await expect(check.locator('main').getByText('Récipe N° 000001: Anulado')).toBeVisible();
  await expect(check.locator('main')).not.toContainText('Dosis equivocada');
  expect((await notices(patient.token)).some((n) => n.type === 'PRESCRIPTION_ANNULLED')).toBe(true);

  await Promise.all([doctorContext.close(), patientContext.close(), pharmacy.close()]);
});

test('reglas: solo médicos verificados con talonario, datos del art. 6 y récipes que no se editan', async () => {
  expect((await api('GET', '/prescriptions/config')).data).toMatchObject({ enabled: true, maxItems: 8 });

  // Un médico sin talonario no emite y sabe qué le falta.
  const plain = await createPublishedDoctor({ specialtySlug: 'dermatologia' });
  const missing = await api('GET', '/prescriptions/pad', undefined, plain.token);
  expect(missing.data.canIssue).toBe(false);
  expect(missing.data.missing).toEqual(expect.arrayContaining(['MPPS', 'CEDULA', 'RULES', 'ESTABLISHMENT', 'SIGNATURE', 'SEAL']));
  const blocked = await api('POST', '/prescriptions', issueBody('V-12345678'), plain.token);
  expect(blocked.status).toBe(403);
  // Ni siquiera con talonario si no está verificado.
  await sql(`update "ProfessionalProfile" set "verificationStatus" = 'IN_REVIEW' where id = $1`, [plain.id]);
  expect((await api('GET', '/prescriptions/pad', undefined, plain.token)).data.missing).toContain('VERIFICATION');

  const doctor = await createPrescriber();
  const patient = await createPatient();
  expect((await api('POST', '/prescriptions', issueBody(patient.cedula))).status).toBe(401);
  expect((await api('POST', '/prescriptions', issueBody(patient.cedula), patient.token)).status).toBe(403);
  // Cédula o representante, año de nacimiento y medicamentos completos.
  expect((await api('POST', '/prescriptions', issueBody(patient.cedula, { patientCedula: undefined }), doctor.token)).status).toBe(400);
  expect((await api('POST', '/prescriptions', issueBody(patient.cedula, { patientBirthYear: 2999 }), doctor.token)).status).toBe(400);
  expect((await api('POST', '/prescriptions', issueBody(patient.cedula, { items: [item({ dose: '' })] }), doctor.token)).status).toBe(400);
  expect((await api('POST', '/prescriptions', issueBody(patient.cedula, { items: Array.from({ length: 9 }, () => item()) }), doctor.token)).status).toBe(400);
  const tooLong = await api(
    'POST',
    '/prescriptions',
    issueBody(patient.cedula, {
      items: Array.from({ length: 8 }, () => item({ dose: 'una dosis larguísima '.repeat(7), instructions: 'una indicación muy detallada '.repeat(10) })),
      patientInstructions: 'texto '.repeat(250),
    }),
    doctor.token,
  );
  expect(tooLong.status).toBe(400);
  expect(tooLong.data.message).toMatch(/no cabe en media hoja/);
  // Paciente de otro médico: no se le puede entregar.
  const foreign = await api('POST', '/prescriptions', issueBody(patient.cedula, { patientId: '00000000-0000-4000-8000-000000000000' }), doctor.token);
  expect(foreign.status).toBe(404);

  // Un menor sin cédula, con su representante; correlativo y vencimiento al final del día.
  const minor = await api(
    'POST',
    '/prescriptions',
    issueBody(patient.cedula, {
      patientName: 'Ana Prueba',
      patientCedula: undefined,
      patientBirthYear: 2020,
      guardianName: `Pedro ${patient.lastName}`,
      guardianCedula: patient.cedula,
      validityDays: 1,
      items: [item({ nonSubstitutable: true, brandNames: 'Amoxil, Trimoxal' })],
    }),
    doctor.token,
  );
  expect(minor.status, JSON.stringify(minor.data)).toBe(201);
  expect(minor.data).toMatchObject({ number: 1, status: 'VALID' });
  expect(minor.data.content.patient).toMatchObject({ cedula: null, guardian: { cedula: patient.cedula } });
  const expires = new Date(minor.data.expiresAt);
  expect(expires.toLocaleTimeString('en-GB', { timeZone: 'America/Caracas' })).toBe('23:59:59');
  const second = await api('POST', '/prescriptions', issueBody(patient.cedula, { patientCedula: 'v-20.111.222' }), doctor.token);
  expect(second.status).toBe(201);
  expect(second.data.number).toBe(2);
  expect(second.data.content.patient.cedula).toBe('V-20111222');

  // Nadie más lo ve; el contenido va cifrado en la base y el récipe emitido no se edita.
  const other = await createPrescriber();
  expect((await api('GET', `/prescriptions/${minor.data.id}`, undefined, other.token)).status).toBe(404);
  const [row] = await sql<{ contentEnc: string; codeEnc: string }>(`select "contentEnc", "codeEnc" from "Prescription" where id = $1`, [minor.data.id]);
  expect(row.contentEnc).not.toContain('Amoxicilina');
  expect(row.codeEnc).not.toContain(minor.data.code.replace(/-/g, ''));
  await expect(sql(`update "Prescription" set number = 99 where id = $1`, [minor.data.id])).rejects.toThrow(/no se modifica/);

  // Agregarlo con el código: solo la persona de la cédula impresa (aquí, el representante).
  const stranger = await createPatient();
  expect((await api('POST', '/prescriptions/claim', { code: minor.data.code }, stranger.token)).status).toBe(403);
  const claimed = await api('POST', '/prescriptions/claim', { code: minor.data.code.toLowerCase() }, patient.token);
  expect(claimed.status).toBe(201);
  expect(claimed.data).toEqual({ id: minor.data.id, alreadySaved: false });
  expect((await api('POST', '/prescriptions/claim', { code: minor.data.code }, patient.token)).data.alreadySaved).toBe(true);
  const mine = await api('GET', '/prescriptions/me', undefined, patient.token);
  expect((mine.data as { id: string }[]).map((p) => p.id)).toContain(minor.data.id);

  // Verificación pública: el récipe, su estado y la huella; nunca el motivo de una anulación.
  const verified = await api('POST', '/prescriptions/verify', { code: second.data.code });
  expect(verified.status).toBe(200);
  expect(verified.data).toMatchObject({ status: 'VALID', intact: true, numberLabel: '000002' });
  expect(verified.data.id).toBeUndefined();
  expect((await api('POST', '/prescriptions/verify', { code: 'ABCD-EFGH-JKMN' })).status).toBe(404);
  expect((await api('POST', '/prescriptions/verify', { code: 'no es un código' })).status).toBe(404);
  const annulled = await api('POST', `/prescriptions/${second.data.id}/annul`, { reason: 'Error en la dosis' }, doctor.token);
  expect(annulled.status).toBe(200);
  expect((await api('POST', `/prescriptions/${second.data.id}/annul`, { reason: 'Otra vez' }, doctor.token)).status).toBe(409);
  const afterAnnul = await api('POST', '/prescriptions/verify', { code: second.data.code });
  expect(afterAnnul.data.status).toBe('ANNULLED');
  expect(JSON.stringify(afterAnnul.data)).not.toContain('Error en la dosis');
  const [annulledRow] = await sql<{ annulReason: string }>(`select "annulReason" from "Prescription" where id = $1`, [second.data.id]);
  expect(annulledRow.annulReason).not.toContain('dosis');
  expect((await api('GET', `/prescriptions/${second.data.id}`, undefined, doctor.token)).data.annulReason).toBe('Error en la dosis');
  expect((await api('POST', '/prescriptions/claim', { code: second.data.code }, patient.token)).status).toBe(400);
  expect((await api('POST', `/prescriptions/${second.data.id}/email`, { email: patient.email }, doctor.token)).status).toBe(400);

  // Búsqueda del médico por nombre (contenido cifrado) y por número.
  const found = await api('GET', '/prescriptions?q=ana%20prueba', undefined, doctor.token);
  expect((found.data.items as { id: string }[]).map((p) => p.id)).toEqual([minor.data.id]);
  const byNumber = await api('GET', '/prescriptions?q=2', undefined, doctor.token);
  expect((byNumber.data.items as { number: number }[]).map((p) => p.number)).toContain(2);
});

test('PDF, firma con fondo transparente y correo con el PDF adjunto', async () => {
  test.skip(!HAS_STORAGE, 'Las subidas y los PDF necesitan almacenamiento (en CI)');
  const doctor = await createPrescriber();
  const patient = await createPatient();

  // Una imagen sin trazos no sirve como firma.
  const blank = await uploadPadImage(doctor.token, 'signature', BLANK_PNG);
  expect(blank.status).toBe(400);
  expect(await blank.text()).toMatch(/No encontramos la firma/);
  const pad = await api('GET', '/prescriptions/pad', undefined, doctor.token);
  expect(pad.data.pad.signatureUrl).toBeTruthy();
  expect(pad.data.canIssue).toBe(true);

  const preview = await pdfFrom('/prescriptions/pad/preview', { headers: { authorization: `Bearer ${doctor.token}` } });
  expect(preview.status).toBe(200);
  expect(preview.type).toContain('application/pdf');
  expect(preview.body.subarray(0, 5).toString()).toBe('%PDF-');

  const issued = await api('POST', '/prescriptions', issueBody(patient.cedula), doctor.token);
  expect(issued.status).toBe(201);
  const own = await pdfFrom(`/prescriptions/${issued.data.id}/pdf`, { headers: { authorization: `Bearer ${doctor.token}` } });
  expect(own.status).toBe(200);
  expect(own.body.subarray(0, 5).toString()).toBe('%PDF-');
  // Quien tiene el código lo descarga sin sesión; con otro código, no.
  const byCode = await pdfFrom('/prescriptions/verify/pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: issued.data.code }),
  });
  expect(byCode.status).toBe(200);
  expect(byCode.type).toContain('application/pdf');
  // Cambiar la firma no toca el récipe ya emitido: su imagen se conserva.
  const [before] = await sql<{ signatureKey: string }>(`select "signatureKey" from "Prescription" where id = $1`, [issued.data.id]);
  expect((await uploadPadImage(doctor.token, 'signature')).status).toBe(201);
  expect((await pdfFrom(`/prescriptions/${issued.data.id}/pdf`, { headers: { authorization: `Bearer ${doctor.token}` } })).status).toBe(200);
  const [after] = await sql<{ signatureKey: string }>(`select "signatureKey" from "Prescription" where id = $1`, [issued.data.id]);
  expect(after.signatureKey).toBe(before.signatureKey);

  if (MAILPIT) {
    const since = new Date();
    const sent = await api('POST', `/prescriptions/${issued.data.id}/email`, { email: patient.email }, doctor.token);
    expect(sent.status, JSON.stringify(sent.data)).toBe(200);
    expect(sent.data.emailsLeft).toBe(4);
    const mail = await latestMail(patient.email, since);
    expect(mail.subject).toBe(`Récipe N° 000001 de Dr(a). Diana ${doctor.lastName}`);
    expect(mail.text).toContain(issued.data.code);
  }
});
