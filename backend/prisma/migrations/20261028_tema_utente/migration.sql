-- App theme chosen by the user in Profile ("chiaro" light, "scuro" dark).
-- Null: the app follows the phone's light or dark mode.

-- AlterTable
ALTER TABLE "utenti" ADD COLUMN "tema" TEXT;
