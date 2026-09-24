/**
 * Destino de `?next=` después de iniciar sesión: solo rutas internas
 * ("/algo"), nunca "//otro-sitio" ni URLs absolutas (redirección abierta).
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}
