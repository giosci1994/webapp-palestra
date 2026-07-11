-- CreateTable: collegamento account Utente <-> chat Telegram (bot)
CREATE TABLE "collegamenti_telegram" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "telegram_chat_id" BIGINT,
    "codice" TEXT,
    "codice_scadenza" TIMESTAMP(3),
    "collegato_il" TIMESTAMP(3),
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collegamenti_telegram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collegamenti_telegram_utente_id_key" ON "collegamenti_telegram"("utente_id");

-- CreateIndex
CREATE UNIQUE INDEX "collegamenti_telegram_telegram_chat_id_key" ON "collegamenti_telegram"("telegram_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "collegamenti_telegram_codice_key" ON "collegamenti_telegram"("codice");

-- AddForeignKey
ALTER TABLE "collegamenti_telegram" ADD CONSTRAINT "collegamenti_telegram_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;
