import { renderSVG } from 'uqr';

/**
 * QR de la marca, dibujado en el navegador: el contenido (código del paciente
 * o del médico) no viaja a ningún servicio externo.
 */
export function brandQrSvg(value: string): string {
  return renderSVG(value, { ecc: 'M', border: 2, blackColor: '#0f3d33', whiteColor: '#ffffff' });
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Convierte el QR (SVG) en PNG para compartirlo por WhatsApp o guardarlo en el teléfono. */
export async function svgToPng(svg: string, size = 720): Promise<string> {
  const img = new Image();
  img.src = svgDataUrl(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

export async function downloadQrPng(svg: string, fileName: string) {
  const link = document.createElement('a');
  link.href = await svgToPng(svg);
  link.download = fileName;
  link.click();
}
