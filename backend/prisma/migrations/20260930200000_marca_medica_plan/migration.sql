-- El plan de $69.99 se llama «Marca Médica» y se presenta como un servicio
-- de producción de contenido (decisión del titular, 2026-09-30): 2 videos
-- profesionales cada mes, uno de ellos puede ser el video de presentación de
-- la ficha. El valor del enum (AGENCY) no cambia: es interno.
-- El seed ya no pisa el catálogo, así que el cambio va aquí.

UPDATE "SubscriptionPlan"
SET "name" = 'Marca Médica',
    "description" = 'Contenido profesional y máxima visibilidad: tú aportas el conocimiento y nosotros lo convertimos en contenido.',
    "features" = '["Todo lo incluido en Premium", "2 videos profesionales cada mes", "Guion y planificación de cada video", "Grabación, edición, subtítulos y portada", "Publicación colaborativa con Guía Médica Monagas", "Uno de tus videos como presentación en tu ficha", "Prioridad en el espacio «Destacado» (señalado como patrocinado)", "Estadísticas de visitas, contactos y citas", "Informe mensual de rendimiento con recomendaciones", "Puedes usar tus videos en tus redes, WhatsApp y tu web"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "tier" = 'AGENCY';

-- Premium nombraba al plan en su lista de beneficios.
UPDATE "SubscriptionPlan"
SET "features" = replace("features"::text, 'plan Agencia', 'plan Marca Médica')::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "features"::text LIKE '%plan Agencia%';
