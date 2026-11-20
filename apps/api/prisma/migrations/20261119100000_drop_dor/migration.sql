-- Definition of Ready kaldırıldı (yönetici 5. tur, ADR-176). DoD kalır.
ALTER TABLE "spaces" DROP COLUMN "dorItems";
ALTER TABLE "work_items" DROP COLUMN "dorChecked";
