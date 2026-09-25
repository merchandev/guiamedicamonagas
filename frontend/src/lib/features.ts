/**
 * Secciones del sitio que se abren por etapas.
 *
 * Farmacias, laboratorios y clínicas: «Próximamente» hasta cerrar las primeras
 * alianzas. Mientras sea false, /farmacias muestra el aviso, el registro no
 * ofrece el tipo organización (las invitaciones a equipos siguen funcionando)
 * y el plan de organizaciones no se puede contratar. El backend no cambia:
 * poner true reabre todo sin migraciones.
 */
// Tipado como boolean (no como el literal false) para que TypeScript compile
// ambas ramas y el cambio a true no destape errores.
export const ORGANIZATIONS_LAUNCHED: boolean = false;
