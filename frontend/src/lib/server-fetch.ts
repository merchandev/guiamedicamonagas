// API_INTERNAL_URL (sin prefijo NEXT_PUBLIC_) se lee en runtime dentro del
// contenedor — nunca se hornea en el bundle del navegador — y puede apuntar
// al nombre interno del servicio (ej. http://api:4000/api/v1), que el
// navegador no podría resolver. Si no está definida, se usa la misma URL
// pública que el cliente (comportamiento sin cambios fuera de Docker).
const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Fetch para Server Components: datos públicos, sin credenciales, con ISR corta. */
export async function serverGet<T>(path: string, revalidateSeconds = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: revalidateSeconds } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
