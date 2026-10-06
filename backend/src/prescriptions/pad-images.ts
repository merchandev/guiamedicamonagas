import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';

export const PAD_IMAGE_KINDS = ['logo', 'signature', 'seal'] as const;
export type PadImageKind = (typeof PAD_IMAGE_KINDS)[number];

export const PAD_IMAGE_FIELD: Record<PadImageKind, 'logoKey' | 'signatureKey' | 'sealKey'> = {
  logo: 'logoKey',
  signature: 'signatureKey',
  seal: 'sealKey',
};

/** Lado máximo en píxeles: de sobra para imprimir a 300 ppp el tamaño que ocupa cada una en el récipe. */
const MAX_SIDE: Record<PadImageKind, number> = { logo: 500, signature: 900, seal: 700 };
const MAX_INPUT_PIXELS = 40_000_000;
// Fondo claro (papel) → transparente; tinta → opaca; en medio, un degradado
// para que el borde de los trazos no quede dentado.
const PAPER = 228;
const INK = 150;
/** Mínimo de píxeles con tinta para aceptar una firma o un sello (0,2 % de la imagen). */
const MIN_INK_RATIO = 0.002;

/**
 * Deja cada imagen del talonario lista para el PDF, siempre en PNG (el PDF no
 * admite WebP). La firma y el sello se fotografían sobre papel: el fondo claro
 * se vuelve transparente y se recortan los bordes vacíos, para que queden
 * sobre la línea de firma como si estuvieran estampados. El logo se conserva
 * tal cual. Recibe una imagen ya verificada por UploadSecurityService.
 */
export async function preparePadImage(kind: PadImageKind, input: Buffer): Promise<Buffer> {
  const base = () =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_SIDE[kind], height: MAX_SIDE[kind], fit: 'inside', withoutEnlargement: true });

  try {
    if (kind === 'logo') return await base().png({ compressionLevel: 9 }).toBuffer();

    const { data, info } = await base().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let inked = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const alpha = luminance >= PAPER ? 0 : luminance <= INK ? 255 : Math.round(((PAPER - luminance) / (PAPER - INK)) * 255);
      data[i + 3] = Math.min(data[i + 3], alpha);
      if (data[i + 3] > 128) inked++;
    }
    if (inked < (data.length / 4) * MIN_INK_RATIO) {
      throw new BadRequestException(
        kind === 'signature'
          ? 'No encontramos la firma en la imagen. Fírmala con tinta oscura sobre una hoja blanca y vuelve a tomar la foto.'
          : 'No encontramos el sello en la imagen. Estámpalo sobre una hoja blanca y vuelve a tomar la foto.',
      );
    }
    const transparent = () => sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
    try {
      return await transparent().trim().png({ compressionLevel: 9 }).toBuffer();
    } catch {
      return await transparent().png({ compressionLevel: 9 }).toBuffer();
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new UnprocessableEntityException('La imagen está dañada o no se pudo procesar');
  }
}
