import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { caracasEndOfDay } from '../../src/common/caracas-time';
import {
  itemsSummary,
  PrescriptionContent,
  prescriptionDisplayStatus,
  prescriptionHash,
  prescriptionNumberLabel,
  shortFingerprint,
} from '../../src/prescriptions/prescription-content';
import { pdfSafe, prescriptionFits, PrescriptionPdfInput, renderPrescriptionPdf } from '../../src/prescriptions/prescription-pdf';
import { preparePadImage } from '../../src/prescriptions/pad-images';
import { ENCRYPTED_FIELDS } from '../../src/crypto/key-rotation';
import { PRESCRIPTION_CONTEXTS } from '../../src/prescriptions/prescription.codec';

const item = (overrides: Partial<PrescriptionContent['items'][number]> = {}) => ({
  activeIngredient: 'Amoxicilina',
  concentration: '500 mg',
  pharmaceuticalForm: 'Cápsulas',
  route: 'oral',
  dose: '1 cápsula cada 8 horas',
  duration: '7 días',
  quantity: '21 cápsulas',
  brandNames: 'Amoxil, Trimoxal',
  nonSubstitutable: false,
  instructions: 'Tomar con alimentos.',
  ...overrides,
});

const content = (overrides: Partial<PrescriptionContent> = {}): PrescriptionContent => ({
  prescriber: { fullName: 'Diana Pérez', cedula: 'V-12345678', mppsNumber: '54321', colegioNumber: '1234', specialties: ['Medicina interna'] },
  establishment: { name: 'Consultorio Pérez', address: 'Av. Bolívar, Maturín', rif: 'J-12345678-9', phone: '0291-5550000' },
  place: 'Maturín, estado Monagas',
  patient: { fullName: 'Pedro Gómez', cedula: 'V-20111222', birthYear: 1985, guardian: null },
  items: [item()],
  pharmacistNotes: null,
  patientInstructions: 'Reposo relativo y abundante agua.',
  ...overrides,
});

const issuedAt = new Date('2026-10-05T14:00:00Z');
const pdfInput = (overrides: Partial<PrescriptionPdfInput> = {}): PrescriptionPdfInput => ({
  number: 12,
  code: 'K7Q4M9TXP3WD',
  verifyUrl: 'https://guiamedicamonagas.com/recipe#K7Q4-M9TX-P3WD',
  verifyLabel: 'guiamedicamonagas.com/recipe',
  fingerprint: '3F9A 12C4 77B0',
  issuedAt,
  expiresAt: caracasEndOfDay(issuedAt, 30),
  content: content(),
  images: { logo: null, signature: null, seal: null },
  ...overrides,
});

/** Hoja blanca con un trazo oscuro, como la foto de una firma. */
async function inkOnPaper(width = 400, height = 200): Promise<Buffer> {
  const stroke = Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fbfbf8"/><path d="M40 140 C 120 20, 200 180, 360 60" stroke="#1a237e" stroke-width="10" fill="none"/></svg>`,
  );
  return sharp(stroke).jpeg().toBuffer();
}

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

describe('contenido del récipe', () => {
  it('la huella no depende del orden de las claves y cambia con cualquier dato', () => {
    const base = { professionalId: 'p1', number: 12, code: 'K7Q4M9TXP3WD', issuedAt, expiresAt: caracasEndOfDay(issuedAt, 30) };
    const original = prescriptionHash({ ...base, content: content() });
    const reordered = content();
    reordered.patient = { guardian: null, birthYear: 1985, cedula: 'V-20111222', fullName: 'Pedro Gómez' };
    expect(prescriptionHash({ ...base, content: reordered })).toBe(original);
    expect(prescriptionHash({ ...base, content: content({ items: [item({ dose: '2 cápsulas cada 8 horas' })] }) })).not.toBe(original);
    expect(prescriptionHash({ ...base, number: 13, content: content() })).not.toBe(original);
    expect(shortFingerprint(original)).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/);
  });

  it('estado: vigente, vencido o anulado', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(prescriptionDisplayStatus({ status: 'ISSUED', expiresAt: new Date('2026-11-01T00:00:00Z') }, now)).toBe('VALID');
    expect(prescriptionDisplayStatus({ status: 'ISSUED', expiresAt: new Date('2026-10-19T00:00:00Z') }, now)).toBe('EXPIRED');
    expect(prescriptionDisplayStatus({ status: 'ANNULLED', expiresAt: new Date('2026-11-01T00:00:00Z') }, now)).toBe('ANNULLED');
  });

  it('vence al final del día de Caracas, también si se emite de noche', () => {
    // 23:30 del 5 de octubre en Caracas (ya es 6 de octubre en UTC).
    const lateNight = new Date('2026-10-06T03:30:00Z');
    expect(caracasEndOfDay(lateNight, 30).toISOString()).toBe('2026-11-05T03:59:59.999Z');
    expect(caracasEndOfDay(lateNight, 0).toISOString()).toBe('2026-10-06T03:59:59.999Z');
  });

  it('número con ceros y resumen para listas', () => {
    expect(prescriptionNumberLabel(12)).toBe('000012');
    expect(itemsSummary([item()])).toBe('Amoxicilina 500 mg');
    expect(itemsSummary([item(), item({ activeIngredient: 'Ibuprofeno', concentration: '400 mg' })])).toBe('Amoxicilina 500 mg + 1 más');
  });

  it('el contenido y el código se rotan con el resto de los campos cifrados', () => {
    expect(ENCRYPTED_FIELDS.some((f) => f.model === 'prescription' && f.context === PRESCRIPTION_CONTEXTS.content)).toBe(true);
    expect(ENCRYPTED_FIELDS.some((f) => f.model === 'prescription' && f.context === PRESCRIPTION_CONTEXTS.code)).toBe(true);
    expect(ENCRYPTED_FIELDS.some((f) => f.model === 'prescription' && f.context === PRESCRIPTION_CONTEXTS.annulReason)).toBe(true);
  });
});

describe('PDF del récipe', () => {
  it('sin caracteres que las fuentes del PDF no tengan', () => {
    expect(pdfSafe('Ibuprofeno ≤ 400 mg “cada” 8 h — ñandú')).toBe('Ibuprofeno <= 400 mg “cada” 8 h — ñandú');
    expect(pdfSafe('Dosis 💊 única')).toBe('Dosis ? única');
  });

  it('dos páginas (original y copia) con firma, sello y logo', async () => {
    const signature = await preparePadImage('signature', await inkOnPaper());
    const seal = await preparePadImage('seal', await inkOnPaper(300, 300));
    const logo = await preparePadImage('logo', await inkOnPaper(200, 200));
    const pdf = await renderPrescriptionPdf(pdfInput({ images: { logo, signature, seal } }), { compress: false });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(2);
    expect(pdf.toString('latin1')).toContain('/Subtype /Image');
  });

  it('con menor sin cédula, insustituible, advertencias y marca de agua', async () => {
    const pdf = await renderPrescriptionPdf(
      pdfInput({
        content: content({
          patient: { fullName: 'Ana Gómez', cedula: null, birthYear: 2020, guardian: { fullName: 'Pedro Gómez', cedula: 'V-20111222' } },
          items: [item({ nonSubstitutable: true })],
          pharmacistNotes: 'No sustituir por presentaciones con azúcar.',
        }),
        watermark: 'ANULADO',
      }),
    );
    expect(pageCount(pdf)).toBe(2);
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('ocho medicamentos comunes caben; un texto desmedido se rechaza antes de emitir', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => item({ activeIngredient: `Medicamento ${i + 1}` }));
    expect(await prescriptionFits(pdfInput({ content: content({ items: eight }) }))).toBe(true);
    const huge = Array.from({ length: 8 }, () =>
      item({ dose: 'x'.repeat(10) + ' una dosis muy larga '.repeat(7), instructions: 'indicación muy detallada '.repeat(12) }),
    );
    expect(await prescriptionFits(pdfInput({ content: content({ items: huge, patientInstructions: 'texto '.repeat(250) }) }))).toBe(false);
  });
});

describe('imágenes del talonario', () => {
  it('firma: el papel queda transparente y la tinta opaca, recortada', async () => {
    const png = await preparePadImage('signature', await inkOnPaper());
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(info.width).toBeLessThan(400); // se recortaron los bordes vacíos
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(100);
  });

  it('rechaza una hoja en blanco como firma o sello', async () => {
    const blank = await sharp({ create: { width: 300, height: 150, channels: 3, background: '#ffffff' } }).png().toBuffer();
    await expect(preparePadImage('signature', blank)).rejects.toThrow(/No encontramos la firma/);
    await expect(preparePadImage('seal', blank)).rejects.toThrow(/No encontramos el sello/);
  });

  it('el logo se conserva (en PNG)', async () => {
    const png = await preparePadImage('logo', await inkOnPaper(200, 120));
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(200);
  });
});
