-- AlterTable
ALTER TABLE "spaces" ADD COLUMN     "dodEnforced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dodItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dorItems" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "sprints" ADD COLUMN     "reviewNotes" TEXT;

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN     "dodChecked" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dorChecked" TEXT[] DEFAULT ARRAY[]::TEXT[];
