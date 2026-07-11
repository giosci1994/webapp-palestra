-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "revoco_effettivo_dopo" TIMESTAMP(3),
ADD COLUMN "durata_giorni" INTEGER NOT NULL DEFAULT 7;
