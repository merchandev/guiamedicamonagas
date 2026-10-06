import PDFDocument from 'pdfkit';
import { encode } from 'uqr';
import { caracasLongDate } from '../common/caracas-time';
import { formatShareCode } from '../patients/share-code.util';
import { PrescriptionContent, PrescriptionItem, prescriptionNumberLabel } from './prescription-content';

export interface PadImages {
  logo: Buffer | null;
  signature: Buffer | null;
  seal: Buffer | null;
}

export interface PrescriptionPdfInput {
  number: number;
  /** Código de verificación normalizado (12 caracteres). */
  code: string;
  /** Enlace del QR: la página de verificación con el código en el fragmento (#). */
  verifyUrl: string;
  /** Lo que se imprime para verificar a mano («guiamedicamonagas.com/recipe»). */
  verifyLabel: string;
  fingerprint: string;
  issuedAt: Date;
  expiresAt: Date;
  content: PrescriptionContent;
  images: PadImages;
  /** «MUESTRA», «ANULADO» o «VENCIDO» en diagonal sobre cada mitad. */
  watermark?: string | null;
}

/** El contenido no cabe en media hoja ni con la letra más pequeña permitida. */
export class PrescriptionTooLongError extends Error {
  constructor() {
    super('El récipe no cabe en media hoja: acorta las indicaciones o divide los medicamentos en dos récipes.');
  }
}

// Hoja carta horizontal partida en dos medias cartas: a la izquierda el cuerpo
// del récipe (para la farmacia) y a la derecha las indicaciones al paciente,
// como exige el art. 5 de la Resolución 031/2013. La página 1 es el original
// (queda en la farmacia) y la 2 la copia que la farmacia devuelve sellada.
const PAGE_W = 792;
const PAGE_H = 612;
const HALF = PAGE_W / 2;
const MARGIN = 22;
const CONTENT_W = HALF - 2 * MARGIN;
const LOGO_SIDE = 54;
const SIGNATURE_H = 76;
const FOOTER_H = 54;
const BODY_SIZES = [9.5, 9, 8.5, 8, 7.5, 7, 6.5];
const LINE_GAP = 1;

const INK = '#1b2a2f';
const MUTED = '#4b5a60';
const ACCENT = '#0f6e5c';
const RULE = '#c3cfd2';

const PAGES = [
  'ORIGINAL · queda en la farmacia',
  'COPIA · la farmacia la devuelve sellada al paciente',
] as const;

const PAGE_OPTIONS = { size: 'LETTER', layout: 'landscape', margin: 0 } as const;

type Doc = PDFKit.PDFDocument;
type HalfKind = 'RECIPE' | 'INDICATIONS';

/** Imagen ya incrustada en el PDF: se reutiliza en las cuatro mitades sin repetir sus bytes. */
type EmbeddedImage = Buffer;
interface Images {
  logo: EmbeddedImage | null;
  signature: EmbeddedImage | null;
  seal: EmbeddedImage | null;
}

function openImage(doc: Doc, source: Buffer | null): EmbeddedImage | null {
  if (!source) return null;
  return (doc as unknown as { openImage(src: Buffer): EmbeddedImage }).openImage(source);
}

function openImages(doc: Doc, images: PadImages): Images {
  let logo: EmbeddedImage | null = null;
  try {
    logo = openImage(doc, images.logo);
  } catch {
    // Un logo dañado no impide emitir el récipe; firma y sello sí son obligatorios.
  }
  return { logo, signature: openImage(doc, images.signature), seal: openImage(doc, images.seal) };
}

// Las fuentes estándar del PDF solo tienen los caracteres de WinAnsi (español
// incluido). El resto se reemplaza para que nunca salga un glifo roto.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function pdfSafe(text: string): string {
  return Array.from(text.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[\t\r   ]/g, ' '))
    .map((char) => {
      const code = char.charCodeAt(0);
      const ok = char === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(char);
      return ok ? char : '?';
    })
    .join('');
}

interface Run {
  bold: boolean;
  text: string;
}
interface Paragraph {
  runs: Run[];
  indent: number;
  gapBefore: number;
  sizeDelta?: number;
}

const itemTitle = (item: PrescriptionItem, index: number) => `${index + 1}. ${item.activeIngredient} ${item.concentration}`.trim();

function bodyParagraphs(kind: HalfKind, content: PrescriptionContent): Paragraph[] {
  if (kind === 'RECIPE') {
    const paragraphs: Paragraph[] = [{ runs: [{ bold: true, text: 'Rp.' }], indent: 0, gapBefore: 0, sizeDelta: 1 }];
    content.items.forEach((item, index) => {
      paragraphs.push({
        runs: [
          { bold: true, text: itemTitle(item, index) },
          ...(item.nonSubstitutable ? [{ bold: true, text: ' (INSUSTITUIBLE)' }] : []),
        ],
        indent: 0,
        gapBefore: index === 0 ? 3 : 6,
      });
      paragraphs.push({
        runs: [{ bold: false, text: `${item.pharmaceuticalForm}, vía ${item.route}${item.brandNames ? ` (${item.brandNames})` : ''}` }],
        indent: 10,
        gapBefore: 0.5,
      });
      paragraphs.push({
        runs: [
          {
            bold: false,
            text: `Dosis: ${item.dose}. Duración: ${item.duration}.${item.quantity ? ` Cantidad: ${item.quantity}.` : ''}`,
          },
        ],
        indent: 10,
        gapBefore: 0.5,
      });
    });
    if (content.pharmacistNotes) {
      paragraphs.push({
        runs: [
          { bold: true, text: 'Advertencias al farmacéutico: ' },
          { bold: false, text: content.pharmacistNotes },
        ],
        indent: 0,
        gapBefore: 8,
      });
    }
    return paragraphs;
  }

  const paragraphs: Paragraph[] = content.items.map((item, index) => ({
    runs: [
      { bold: true, text: itemTitle(item, index) },
      {
        bold: false,
        text: ` (${item.pharmaceuticalForm}, vía ${item.route}): ${item.dose}. Duración: ${item.duration}.${item.instructions ? ` ${item.instructions}` : ''}`,
      },
    ],
    indent: 0,
    gapBefore: index === 0 ? 0 : 5,
  }));
  if (content.patientInstructions) {
    paragraphs.push({
      runs: [
        { bold: true, text: 'Indicaciones generales: ' },
        { bold: false, text: content.patientInstructions },
      ],
      indent: 0,
      gapBefore: 8,
    });
  }
  return paragraphs;
}

/** Alto del cuerpo con una letra dada; se mide todo en negrita (más ancha), así nunca se queda corto. */
function bodyHeight(doc: Doc, paragraphs: Paragraph[], size: number): number {
  let height = 0;
  for (const paragraph of paragraphs) {
    height += paragraph.gapBefore;
    doc.font('Helvetica-Bold').fontSize(size + (paragraph.sizeDelta ?? 0));
    height += doc.heightOfString(pdfSafe(paragraph.runs.map((run) => run.text).join('')), {
      width: CONTENT_W - paragraph.indent,
      lineGap: LINE_GAP,
    });
  }
  return height;
}

function drawParagraphs(doc: Doc, x: number, top: number, paragraphs: Paragraph[], size: number) {
  let y = top;
  for (const paragraph of paragraphs) {
    y += paragraph.gapBefore;
    doc.fontSize(size + (paragraph.sizeDelta ?? 0)).fillColor(INK);
    paragraph.runs.forEach((run, index) => {
      const continued = index < paragraph.runs.length - 1;
      doc.font(run.bold ? 'Helvetica-Bold' : 'Helvetica');
      if (index === 0) {
        doc.text(pdfSafe(run.text), x + paragraph.indent, y, { width: CONTENT_W - paragraph.indent, lineGap: LINE_GAP, continued });
      } else {
        doc.text(pdfSafe(run.text), { continued });
      }
    });
    y = doc.y;
  }
}

function registrationLine(prescriber: PrescriptionContent['prescriber']): string {
  return [
    `C.I. ${prescriber.cedula}`,
    `M.P.P.S. N° ${prescriber.mppsNumber}`,
    prescriber.colegioNumber ? `C.M. N° ${prescriber.colegioNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function establishmentLine(establishment: PrescriptionContent['establishment']): string {
  return [establishment.name, establishment.address, `RIF ${establishment.rif}`, establishment.phone ? `Tel. ${establishment.phone}` : null]
    .filter(Boolean)
    .join(' · ');
}

/** Membrete: logo, médico y establecimiento. Siempre reserva el alto del logo, haya o no. */
function drawHeader(doc: Doc, x: number, y: number, input: PrescriptionPdfInput, images: Images): number {
  const { prescriber, establishment } = input.content;
  let textX = x;
  if (images.logo) {
    doc.image(images.logo, x, y, { fit: [LOGO_SIDE, LOGO_SIDE], align: 'center', valign: 'center' });
    textX = x + LOGO_SIDE + 8;
  }
  const width = x + CONTENT_W - textX;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11.5).text(pdfSafe(`Dr(a). ${prescriber.fullName}`), textX, y, { width, lineGap: 0.5 });
  doc.font('Helvetica').fontSize(8.2).fillColor(MUTED);
  if (prescriber.specialties.length) doc.text(pdfSafe(prescriber.specialties.join(' · ')), textX, doc.y, { width });
  doc.text(pdfSafe(registrationLine(prescriber)), textX, doc.y, { width });
  doc.fontSize(7.4).text(pdfSafe(establishmentLine(establishment)), textX, doc.y + 1, { width, lineGap: 0.3 });
  const bottom = Math.max(doc.y, y + LOGO_SIDE) + 5;
  doc.moveTo(x, bottom).lineTo(x + CONTENT_W, bottom).lineWidth(1.2).strokeColor(ACCENT).stroke();
  return bottom + 7;
}

function drawTitle(doc: Doc, x: number, y: number, kind: HalfKind, copyLabel: string, number: number): number {
  const half = CONTENT_W / 2;
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(ACCENT)
    .text(kind === 'RECIPE' ? 'RÉCIPE' : 'INDICACIONES', x, y, { width: half, characterSpacing: 1.2 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`N° ${prescriptionNumberLabel(number)}`, x + half, y, { width: half, align: 'right' });
  doc.font('Helvetica').fontSize(6.8).fillColor(MUTED).text(copyLabel, x + half - 60, y + 11, { width: half + 60, align: 'right' });
  return y + 24;
}

function drawPatient(doc: Doc, x: number, y: number, input: PrescriptionPdfInput): number {
  const { patient, place } = input.content;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.6).text('Paciente: ', x, y, { width: CONTENT_W, continued: true });
  doc.font('Helvetica').text(pdfSafe(patient.fullName));
  const identity = patient.cedula ? `C.I. ${patient.cedula}` : 'Sin cédula';
  doc.text(pdfSafe(`${identity} · Año de nacimiento: ${patient.birthYear}`), x, doc.y, { width: CONTENT_W });
  if (patient.guardian) {
    doc.text(pdfSafe(`Representante: ${patient.guardian.fullName} (C.I. ${patient.guardian.cedula})`), x, doc.y, { width: CONTENT_W });
  }
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .text(pdfSafe(`${place}, ${caracasLongDate(input.issuedAt)} · Vence el ${caracasLongDate(input.expiresAt)}`), x, doc.y + 1, { width: CONTENT_W });
  const bottom = doc.y + 4;
  doc.moveTo(x, bottom).lineTo(x + CONTENT_W, bottom).lineWidth(0.5).strokeColor(RULE).stroke();
  return bottom + 6;
}

/** Firma y sello del médico (art. 6, num. 8) sobre la línea de firma. */
function drawSignature(doc: Doc, x: number, y: number, input: PrescriptionPdfInput, images: Images) {
  const signatureX = x + 58;
  const signatureW = 150;
  if (images.signature) {
    doc.image(images.signature, signatureX, y, { fit: [signatureW, 50], align: 'center', valign: 'bottom' });
  }
  if (images.seal) {
    doc.image(images.seal, signatureX + signatureW + 12, y - 6, { fit: [78, 66], align: 'center', valign: 'center' });
  }
  const lineY = y + 52;
  doc.moveTo(signatureX, lineY).lineTo(signatureX + signatureW, lineY).lineWidth(0.6).strokeColor(INK).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('Firma y sello', signatureX, lineY + 3, { width: signatureW, align: 'center' });
  const { prescriber } = input.content;
  doc.text(pdfSafe(`Dr(a). ${prescriber.fullName} · M.P.P.S. N° ${prescriber.mppsNumber}`), signatureX - 40, doc.y, {
    width: signatureW + 80,
    align: 'center',
  });
}

function drawQr(doc: Doc, value: string, x: number, y: number, side: number) {
  const qr = encode(value, { ecc: 'M', border: 0 });
  const cell = side / qr.size;
  doc.save();
  qr.data.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) doc.rect(x + c * cell, y + r * cell, cell + 0.05, cell + 0.05);
    }),
  );
  doc.fill('#000000');
  doc.restore();
}

function drawFooter(doc: Doc, x: number, y: number, input: PrescriptionPdfInput) {
  drawQr(doc, input.verifyUrl, x, y, 50);
  const textX = x + 58;
  const width = CONTENT_W - 58;
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(INK)
    .text(`Código de verificación: ${formatShareCode(input.code)}`, textX, y + 1, { width });
  doc
    .font('Helvetica')
    .fontSize(6.9)
    .fillColor(MUTED)
    .text(pdfSafe(`Verifíquelo en ${input.verifyLabel} con este código o con el QR.`), textX, doc.y + 1, { width });
  doc.text(pdfSafe(`Huella ${input.fingerprint} · Emitido en línea por el médico, con su firma y sello digitalizados.`), textX, doc.y + 1, {
    width,
  });
}

function drawWatermark(doc: Doc, x0: number, text: string) {
  doc.save();
  doc.rotate(-28, { origin: [x0 + HALF / 2, PAGE_H / 2] });
  doc
    .font('Helvetica-Bold')
    .fontSize(44)
    .fillColor('#b91c1c')
    .opacity(0.16)
    .text(text, x0 + 10, PAGE_H / 2 - 22, { width: HALF - 20, align: 'center' });
  doc.restore();
}

function drawHalf(doc: Doc, x0: number, kind: HalfKind, copyLabel: string, input: PrescriptionPdfInput, images: Images) {
  const x = x0 + MARGIN;
  let y = drawHeader(doc, x, MARGIN, input, images);
  y = drawTitle(doc, x, y, kind, copyLabel, input.number);
  y = drawPatient(doc, x, y, input);

  const signatureTop = PAGE_H - MARGIN - FOOTER_H - SIGNATURE_H;
  const paragraphs = bodyParagraphs(kind, input.content);
  const size = BODY_SIZES.find((candidate) => bodyHeight(doc, paragraphs, candidate) <= signatureTop - 8 - y);
  if (size === undefined) throw new PrescriptionTooLongError();
  drawParagraphs(doc, x, y, paragraphs, size);

  drawSignature(doc, x, signatureTop, input, images);
  drawFooter(doc, x, PAGE_H - MARGIN - FOOTER_H + 4, input);
  if (input.watermark) drawWatermark(doc, x0, input.watermark);
}

/**
 * PDF del récipe: dos páginas (original y copia), cada una con el cuerpo del
 * récipe a la izquierda y las indicaciones a la derecha, para cortar por la
 * línea punteada. Sin publicidad de ningún tipo (art. 6, último aparte).
 */
export async function renderPrescriptionPdf(input: PrescriptionPdfInput, options: { compress?: boolean } = {}): Promise<Buffer> {
  const doc = new PDFDocument({
    ...PAGE_OPTIONS,
    compress: options.compress ?? true,
    lang: 'es-VE',
    info: {
      Title: `Récipe N° ${prescriptionNumberLabel(input.number)}`,
      Author: pdfSafe(`Dr(a). ${input.content.prescriber.fullName}`),
      Subject: 'Récipe médico',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  try {
    const images = openImages(doc, input.images);
    PAGES.forEach((label, index) => {
      if (index > 0) doc.addPage(PAGE_OPTIONS);
      doc.moveTo(HALF, 14).lineTo(HALF, PAGE_H - 14).dash(3, { space: 3 }).lineWidth(0.5).strokeColor(RULE).stroke().undash();
      drawHalf(doc, 0, 'RECIPE', label, input, images);
      drawHalf(doc, HALF, 'INDICATIONS', 'Para el paciente', input, images);
    });
  } finally {
    doc.end();
  }
  return finished;
}

/** Comprueba antes de emitir que el récipe cabe en media hoja. */
export async function prescriptionFits(input: PrescriptionPdfInput): Promise<boolean> {
  try {
    await renderPrescriptionPdf({ ...input, images: { logo: null, signature: null, seal: null } }, { compress: false });
    return true;
  } catch (error) {
    if (error instanceof PrescriptionTooLongError) return false;
    throw error;
  }
}
