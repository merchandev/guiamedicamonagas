-- Nombres de los planes de médicos (decisión del titular, 2026-09-30):
-- Perfil Básico, Profesional, Plus, Premium y Agencia. Solo cambia
-- «Profesional Plus», que pasa a llamarse «Plus». El valor del enum
-- (PROFESSIONAL_PLUS) no cambia: es interno.
-- El seed ya no pisa el catálogo, así que el cambio va aquí.

UPDATE "SubscriptionPlan" SET "name" = 'Plus', "updatedAt" = CURRENT_TIMESTAMP WHERE "tier" = 'PROFESSIONAL_PLUS';

-- La lista de beneficios de los demás planes lo nombraba.
UPDATE "SubscriptionPlan"
SET "features" = replace("features"::text, 'plan Profesional Plus', 'plan Plus')::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE "features"::text LIKE '%plan Profesional Plus%';
