-- Tabelle e colonne create fuori dalle migrazioni (db push), maggio 2026.
--
-- Nel database di produzione esistono, ma nessuna migrazione le creava: le
-- tabelle dei personal trainer e dei suggerimenti di esercizi, i loro enum e
-- sei colonne del profilo utente (consensi, onboarding, ruolo richiesto).
-- La migrazione successiva (20260511_annunci_destinatario_schede_pt) modifica
-- annunci_pt, quindi `prisma migrate deploy` su un database vuoto si fermava
-- li': un'installazione nuova o un ripristino non partivano.
--
-- Qui si creano come erano prima della 20260511: annunci_pt senza
-- destinatario_id, che aggiunge proprio quella.
--
-- In produzione va segnata come gia' applicata PRIMA di avviare il backend con
-- questa versione (tabelle e colonne ci sono gia'):
--   prisma migrate resolve --applied 20260510_tabelle_e_colonne_mancanti

-- AlterTable: consensi, onboarding e ruolo richiesto
ALTER TABLE "utenti" ADD COLUMN     "accettazione_privacy" TIMESTAMP(3),
ADD COLUMN     "accettazione_tos" TIMESTAMP(3),
ADD COLUMN     "consenso_cookie" TEXT,
ADD COLUMN     "gamification_attiva" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "profilo_completato" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ruolo_richiesto" "Ruolo";

-- CreateEnum
CREATE TYPE "StatoSuggerimento" AS ENUM ('IN_ATTESA', 'APPROVATO', 'RIFIUTATO');

-- CreateEnum
CREATE TYPE "StatoIscrizione" AS ENUM ('IN_ATTESA', 'ATTIVA', 'RIFIUTATA', 'TERMINATA');

-- CreateTable
CREATE TABLE "suggerimenti_esercizi" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "gruppo_muscolare_primario" TEXT NOT NULL,
    "gruppo_muscolare_secondario" TEXT,
    "attrezzatura_suggerita" TEXT,
    "descrizione" TEXT,
    "stato" "StatoSuggerimento" NOT NULL DEFAULT 'IN_ATTESA',
    "motivo_rifiuto" TEXT,
    "esercizio_creato_id" INTEGER,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gestito_il" TIMESTAMP(3),

    CONSTRAINT "suggerimenti_esercizi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iscrizioni_pt" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "trainer_id" INTEGER NOT NULL,
    "stato" "StatoIscrizione" NOT NULL DEFAULT 'IN_ATTESA',
    "messaggio_richiesta" TEXT,
    "data_richiesta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_risposta" TIMESTAMP(3),
    "note_pt" TEXT,

    CONSTRAINT "iscrizioni_pt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appuntamenti_pt" (
    "id" SERIAL NOT NULL,
    "trainer_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT,
    "data_ora" TIMESTAMP(3) NOT NULL,
    "durata_minuti" INTEGER NOT NULL DEFAULT 60,
    "completato" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appuntamenti_pt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annunci_pt" (
    "id" SERIAL NOT NULL,
    "trainer_id" INTEGER NOT NULL,
    "titolo" TEXT NOT NULL,
    "contenuto" TEXT NOT NULL,
    "priorita" TEXT NOT NULL DEFAULT 'normale',
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annunci_pt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iscrizioni_pt_utente_id_trainer_id_key" ON "iscrizioni_pt"("utente_id", "trainer_id");

-- AddForeignKey
ALTER TABLE "suggerimenti_esercizi" ADD CONSTRAINT "suggerimenti_esercizi_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggerimenti_esercizi" ADD CONSTRAINT "suggerimenti_esercizi_esercizio_creato_id_fkey" FOREIGN KEY ("esercizio_creato_id") REFERENCES "esercizi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iscrizioni_pt" ADD CONSTRAINT "iscrizioni_pt_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iscrizioni_pt" ADD CONSTRAINT "iscrizioni_pt_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appuntamenti_pt" ADD CONSTRAINT "appuntamenti_pt_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appuntamenti_pt" ADD CONSTRAINT "appuntamenti_pt_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annunci_pt" ADD CONSTRAINT "annunci_pt_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;
