-- App language chosen by the user in Profile ("en", "it"). Null: the app
-- follows the phone's language.

-- AlterTable
ALTER TABLE "utenti" ADD COLUMN "lingua" TEXT;
