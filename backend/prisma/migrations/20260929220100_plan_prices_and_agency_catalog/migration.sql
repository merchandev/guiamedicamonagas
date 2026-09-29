-- Precios nuevos de los planes de médicos y alta del plan Agencia en el
-- catálogo. Va aparte de la migración anterior: Postgres no deja usar un
-- valor de enum en la misma transacción que lo crea.
-- Las suscripciones ya creadas conservan su precio: cada cuota guarda el
-- monto y la tasa con que se emitió.

UPDATE "SubscriptionPlan" SET "priceUsd" = 3.99, "updatedAt" = CURRENT_TIMESTAMP WHERE "tier" = 'PROFESSIONAL';
UPDATE "SubscriptionPlan" SET "priceUsd" = 5.99, "updatedAt" = CURRENT_TIMESTAMP WHERE "tier" = 'PROFESSIONAL_PLUS';
UPDATE "SubscriptionPlan" SET "priceUsd" = 10.99, "updatedAt" = CURRENT_TIMESTAMP WHERE "tier" = 'PREMIUM';

INSERT INTO "SubscriptionPlan"
  ("id", "tier", "name", "description", "priceUsd", "billingCycle", "features", "maxLocations", "postsLimit", "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'AGENCY',
  'Agencia',
  'Todo lo de Premium más tu presentación en video, producida junto a Guía Médica Monagas.',
  69.99,
  'MONTHLY',
  '["Todo lo del plan Premium", "2 videos en colaboración con Guía Médica Monagas", "Video de presentación de YouTube en tu ficha", "Insignia de verificado dorada", "Prioridad en el espacio «Destacado» (señalado como patrocinado)"]'::jsonb,
  5,
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("tier") DO NOTHING;
