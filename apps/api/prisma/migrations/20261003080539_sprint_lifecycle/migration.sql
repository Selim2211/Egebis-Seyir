-- AlterEnum
ALTER TYPE "SprintItemReason" ADD VALUE 'UNFINISHED';

-- AlterTable
ALTER TABLE "spaces" ADD COLUMN     "sprintGoalRequired" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "sprints" ADD COLUMN     "completedPoints" DOUBLE PRECISION;
