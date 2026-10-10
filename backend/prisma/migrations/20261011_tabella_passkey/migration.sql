-- Passkey: accesso con impronta, volto o PIN del dispositivo (WebAuthn).
-- Una riga per passkey, con la chiave pubblica che verifica le firme.

-- CreateTable
CREATE TABLE "passkey" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "credenziale" TEXT NOT NULL,
    "chiave_pubblica" TEXT NOT NULL,
    "contatore" INTEGER NOT NULL DEFAULT 0,
    "trasporti" TEXT,
    "sincronizzata" BOOLEAN NOT NULL DEFAULT false,
    "nome" TEXT,
    "creata_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso" TIMESTAMP(3),

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "passkey_credenziale_key" ON "passkey"("credenziale");

-- CreateIndex
CREATE INDEX "passkey_utente_id_idx" ON "passkey"("utente_id");

-- AddForeignKey
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

