-- AlterTable
ALTER TABLE "students" ADD COLUMN     "rollOrder" INTEGER;

-- Backfill from existing roll numbers (leading digits only, e.g. "12" or "12A").
UPDATE "students" SET "rollOrder" = substring("rollNumber" from '^\d{1,9}')::int WHERE "rollNumber" ~ '^\d';

-- Registers are listed by section then roll order.
CREATE INDEX "students_section_roll_order_idx" ON "students" ("sectionId", "rollOrder");
