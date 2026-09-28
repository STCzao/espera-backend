-- CreateTable
CREATE TABLE "business_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "business_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_categories_slug_key" ON "business_categories"("slug");

-- Seed: initial categories
-- UUIDs 11111111 and 33333333 are kept from the legacy hardcoded registry
-- so existing dev Business records remain valid after the FK is added.
INSERT INTO "business_categories" ("id", "name", "slug") VALUES
    ('11111111-1111-4111-8111-111111111111', 'Gastronomía',           'gastronomia'),
    ('22222222-2222-4222-8222-222222222222', 'Peluquería y Estética', 'peluqueria-y-estetica'),
    ('33333333-3333-4333-8333-333333333333', 'Trámites y Oficinas',   'tramites-y-oficinas'),
    ('44444444-4444-4444-8444-444444444444', 'Salud',                 'salud'),
    ('55555555-5555-4555-8555-555555555555', 'Comercio y Tiendas',    'comercio-y-tiendas'),
    ('66666666-6666-4666-8666-666666666666', 'Farmacia y Óptica',     'farmacia-y-optica'),
    ('77777777-7777-4777-8777-777777777777', 'Veterinaria',           'veterinaria'),
    ('88888888-8888-4888-8888-888888888888', 'Taller y Servicios',    'taller-y-servicios'),
    ('99999999-9999-4999-8999-999999999999', 'Otro',                  'otro');

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "business_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual rollback (Prisma does not generate down-migrations):
-- ALTER TABLE "businesses" DROP CONSTRAINT "businesses_categoryId_fkey";
-- DROP TABLE "business_categories";
