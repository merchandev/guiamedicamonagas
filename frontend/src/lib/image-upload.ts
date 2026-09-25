/**
 * Reduce en el navegador las fotos grandes antes de subirlas. Una foto de un
 * teléfono actual pesa 5–12 MB y chocaba con el tope de la API (5 MB para
 * fotos de perfil); el servidor igual las re-codifica a 2400 px como máximo,
 * así que achicarlas aquí no pierde calidad útil y sube más rápido.
 * Los PDF y las imágenes pequeñas pasan tal cual.
 */
const MAX_SIDE = 2400;
const SHRINK_ABOVE_BYTES = 3 * 1024 * 1024;

export async function shrinkImageIfLarge(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= SHRINK_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Fondo blanco: un PNG con transparencia no queda negro al pasar a JPG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    // Si el navegador no puede leerla, se sube la original y decide la API.
    return file;
  }
}
