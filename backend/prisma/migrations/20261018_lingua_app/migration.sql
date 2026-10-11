-- The language the app last used, for the messages the server sends outside
-- a request (push notifications, reminders). Everyone registered so far used
-- the app in Italian, the only language it had.

-- AlterTable
ALTER TABLE "utenti" ADD COLUMN "lingua_app" TEXT;

UPDATE "utenti" SET "lingua_app" = 'it';
