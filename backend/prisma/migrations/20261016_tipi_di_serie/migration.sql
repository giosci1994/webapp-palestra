-- Tipi di serie: di lavoro, di riscaldamento o drop. Il riscaldamento resta
-- fuori da volume, conteggi, record e progressione; un drop conta nel volume
-- ma non come serie a se'. Le serie gia' registrate sono tutte di lavoro.

-- CreateEnum
CREATE TYPE "TipoSerie" AS ENUM ('LAVORO', 'RISCALDAMENTO', 'DROP');

-- AlterTable
ALTER TABLE "log_serie" ADD COLUMN "tipo" "TipoSerie" NOT NULL DEFAULT 'LAVORO';
