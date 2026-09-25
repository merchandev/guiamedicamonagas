export type SafeMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const EXTENSION_BY_MIME: Record<SafeMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Tipo real del archivo según sus primeros bytes ("magic bytes"). El MIME
 * que declara el navegador y la extensión del nombre los controla el cliente:
 * nunca se usan para decidir qué es un archivo.
 */
export function detectFileType(buffer: Buffer): SafeMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  // La especificación permite basura antes de "%PDF-" dentro del primer KB.
  if (buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
    return 'application/pdf';
  }
  return null;
}

// Nombres PDF que ejecutan código, lanzan programas o incrustan archivos.
const ACTIVE_PDF_NAMES = ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile', '/RichMedia', '/XFA', '/SubmitForm', '/ImportData'];

/**
 * Busca contenido activo en un PDF. Los nombres PDF admiten escapes "#xx"
 * (/J#61vaScript == /JavaScript), así que se decodifican antes de buscar.
 * Limitación conocida: no descomprime flujos de objetos; por eso además los
 * documentos se sirven siempre como descarga (nunca inline) y, si hay
 * ClamAV configurado, pasan por el antivirus.
 */
export function findActivePdfContent(buffer: Buffer): string | null {
  // Solo se revisa la estructura del PDF (diccionarios), no el contenido de
  // los flujos (`stream … endstream`): ahí van las imágenes y el texto
  // comprimidos, datos binarios en los que 3 bytes como "/JS" aparecen por
  // azar (≈1 de cada 10 PDF escaneados de 2 MB) y rechazaban documentos
  // legítimos. Una acción JavaScript real vive en un diccionario.
  const text = buffer
    .toString('latin1')
    .replace(/(?<![A-Za-z])stream(?:\r\n|\n|\r)[\s\S]*?endstream/g, 'stream endstream')
    .replace(/#([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  for (const name of ACTIVE_PDF_NAMES) {
    const pattern = new RegExp(`${name.replace('/', '\\/')}(?![A-Za-z0-9])`);
    if (pattern.test(text)) return name;
  }
  return null;
}
