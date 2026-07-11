-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Ruolo" AS ENUM ('UTENTE', 'PERSONAL_TRAINER', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "StatoUtente" AS ENUM ('IN_ATTESA', 'ATTIVO', 'BANNATO');

-- CreateEnum
CREATE TYPE "CategoriaAttrezzatura" AS ENUM ('CARDIO', 'PESI_LIBERI', 'MACCHINE', 'CAVI', 'FUNZIONALE');

-- CreateEnum
CREATE TYPE "Livello" AS ENUM ('BASE', 'INTERMEDIO', 'AVANZATO');

-- CreateEnum
CREATE TYPE "Visibilita" AS ENUM ('GLOBALE', 'PERSONALE');

-- CreateEnum
CREATE TYPE "StatoRichiesta" AS ENUM ('IN_ATTESA', 'ACCETTATA', 'RIFIUTATA', 'BLOCCATA');

-- CreateEnum
CREATE TYPE "TipoChat" AS ENUM ('PRIVATA', 'PERSONAL_TRAINER');

-- CreateTable
CREATE TABLE "utenti" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ruolo" "Ruolo" NOT NULL DEFAULT 'UTENTE',
    "palestra_id" INTEGER,
    "stato" "StatoUtente" NOT NULL DEFAULT 'IN_ATTESA',
    "punti_esperienza" INTEGER NOT NULL DEFAULT 0,
    "data_registrazione" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chat_retention_giorni" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "utenti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "scadenza" TIMESTAMP(3) NOT NULL,
    "creato" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocato" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "palestre" (
    "id" SERIAL NOT NULL,
    "nome_catena" TEXT NOT NULL,
    "citta" TEXT NOT NULL,
    "indirizzo" TEXT NOT NULL,
    "nazione" TEXT NOT NULL DEFAULT 'Italia',

    CONSTRAINT "palestre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attrezzature" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaAttrezzatura" NOT NULL,
    "muscoli_bersaglio" TEXT,

    CONSTRAINT "attrezzature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "palestra_attrezzatura" (
    "palestra_id" INTEGER NOT NULL,
    "attrezzatura_id" INTEGER NOT NULL,

    CONSTRAINT "palestra_attrezzatura_pkey" PRIMARY KEY ("palestra_id","attrezzatura_id")
);

-- CreateTable
CREATE TABLE "esercizi" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "gruppo_muscolare_primario" TEXT NOT NULL,
    "gruppo_muscolare_secondario" TEXT,
    "attrezzatura_richiesta_id" INTEGER,
    "descrizione" TEXT,
    "link_video" TEXT,

    CONSTRAINT "esercizi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schede_allenamento" (
    "id" SERIAL NOT NULL,
    "creatore_id" INTEGER NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT,
    "livello" "Livello" NOT NULL DEFAULT 'BASE',
    "visibilita" "Visibilita" NOT NULL DEFAULT 'PERSONALE',
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schede_allenamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "esercizi_scheda" (
    "id" SERIAL NOT NULL,
    "scheda_id" INTEGER NOT NULL,
    "esercizio_id" INTEGER NOT NULL,
    "serie_target" INTEGER NOT NULL,
    "rep_target" TEXT NOT NULL,
    "recupero_secondi" INTEGER NOT NULL,
    "ordine_esecuzione" INTEGER NOT NULL,

    CONSTRAINT "esercizi_scheda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessioni_allenamento" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "scheda_id" INTEGER NOT NULL,
    "data_inizio" TIMESTAMP(3) NOT NULL,
    "data_fine" TIMESTAMP(3),
    "durata_minuti" INTEGER,
    "minuti_riscaldamento" INTEGER,
    "volume_totale_kg" DOUBLE PRECISION,
    "note_finali" TEXT,

    CONSTRAINT "sessioni_allenamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_serie" (
    "id" SERIAL NOT NULL,
    "sessione_id" INTEGER NOT NULL,
    "esercizio_id" INTEGER NOT NULL,
    "serie_numero" INTEGER NOT NULL,
    "peso_effettivo" DOUBLE PRECISION NOT NULL,
    "rep_effettive" INTEGER NOT NULL,
    "rpe" INTEGER,
    "completato" BOOLEAN NOT NULL DEFAULT true,
    "motivo_salto_esercizio" TEXT,
    "note_serie" TEXT,

    CONSTRAINT "log_serie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_personali" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "esercizio_id" INTEGER NOT NULL,
    "peso_max_raggiunto" DOUBLE PRECISION NOT NULL,
    "data_record" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_personali_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "richieste_contatto" (
    "id" SERIAL NOT NULL,
    "mittente_id" INTEGER NOT NULL,
    "destinatario_id" INTEGER NOT NULL,
    "stato" "StatoRichiesta" NOT NULL DEFAULT 'IN_ATTESA',
    "data_richiesta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_risposta" TIMESTAMP(3),

    CONSTRAINT "richieste_contatto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversazioni" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoChat" NOT NULL DEFAULT 'PRIVATA',
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversazioni_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partecipanti_chat" (
    "conversazione_id" INTEGER NOT NULL,
    "utente_id" INTEGER NOT NULL,

    CONSTRAINT "partecipanti_chat_pkey" PRIMARY KEY ("conversazione_id","utente_id")
);

-- CreateTable
CREATE TABLE "messaggi" (
    "id" SERIAL NOT NULL,
    "conversazione_id" INTEGER NOT NULL,
    "mittente_id" INTEGER NOT NULL,
    "contenuto" TEXT NOT NULL,
    "letto" BOOLEAN NOT NULL DEFAULT false,
    "inviato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaggi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversazioni_ai" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "contesto" TEXT NOT NULL,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversazioni_ai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaggi_ai" (
    "id" SERIAL NOT NULL,
    "conversazione_ai_id" INTEGER NOT NULL,
    "ruolo" TEXT NOT NULL,
    "contenuto" TEXT NOT NULL,
    "inviato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaggi_ai_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utenti_email_key" ON "utenti"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "richieste_contatto_mittente_id_destinatario_id_key" ON "richieste_contatto"("mittente_id", "destinatario_id");

-- AddForeignKey
ALTER TABLE "utenti" ADD CONSTRAINT "utenti_palestra_id_fkey" FOREIGN KEY ("palestra_id") REFERENCES "palestre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "palestra_attrezzatura" ADD CONSTRAINT "palestra_attrezzatura_palestra_id_fkey" FOREIGN KEY ("palestra_id") REFERENCES "palestre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "palestra_attrezzatura" ADD CONSTRAINT "palestra_attrezzatura_attrezzatura_id_fkey" FOREIGN KEY ("attrezzatura_id") REFERENCES "attrezzature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esercizi" ADD CONSTRAINT "esercizi_attrezzatura_richiesta_id_fkey" FOREIGN KEY ("attrezzatura_richiesta_id") REFERENCES "attrezzature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schede_allenamento" ADD CONSTRAINT "schede_allenamento_creatore_id_fkey" FOREIGN KEY ("creatore_id") REFERENCES "utenti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esercizi_scheda" ADD CONSTRAINT "esercizi_scheda_scheda_id_fkey" FOREIGN KEY ("scheda_id") REFERENCES "schede_allenamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esercizi_scheda" ADD CONSTRAINT "esercizi_scheda_esercizio_id_fkey" FOREIGN KEY ("esercizio_id") REFERENCES "esercizi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessioni_allenamento" ADD CONSTRAINT "sessioni_allenamento_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessioni_allenamento" ADD CONSTRAINT "sessioni_allenamento_scheda_id_fkey" FOREIGN KEY ("scheda_id") REFERENCES "schede_allenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_serie" ADD CONSTRAINT "log_serie_sessione_id_fkey" FOREIGN KEY ("sessione_id") REFERENCES "sessioni_allenamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_serie" ADD CONSTRAINT "log_serie_esercizio_id_fkey" FOREIGN KEY ("esercizio_id") REFERENCES "esercizi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_personali" ADD CONSTRAINT "record_personali_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_personali" ADD CONSTRAINT "record_personali_esercizio_id_fkey" FOREIGN KEY ("esercizio_id") REFERENCES "esercizi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "richieste_contatto" ADD CONSTRAINT "richieste_contatto_mittente_id_fkey" FOREIGN KEY ("mittente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "richieste_contatto" ADD CONSTRAINT "richieste_contatto_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partecipanti_chat" ADD CONSTRAINT "partecipanti_chat_conversazione_id_fkey" FOREIGN KEY ("conversazione_id") REFERENCES "conversazioni"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partecipanti_chat" ADD CONSTRAINT "partecipanti_chat_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaggi" ADD CONSTRAINT "messaggi_conversazione_id_fkey" FOREIGN KEY ("conversazione_id") REFERENCES "conversazioni"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaggi" ADD CONSTRAINT "messaggi_mittente_id_fkey" FOREIGN KEY ("mittente_id") REFERENCES "utenti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversazioni_ai" ADD CONSTRAINT "conversazioni_ai_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaggi_ai" ADD CONSTRAINT "messaggi_ai_conversazione_ai_id_fkey" FOREIGN KEY ("conversazione_ai_id") REFERENCES "conversazioni_ai"("id") ON DELETE CASCADE ON UPDATE CASCADE;

