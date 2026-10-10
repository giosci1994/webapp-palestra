-- Esercizi preferiti: la stella nel catalogo, una riga per utente ed esercizio.

-- CreateTable
CREATE TABLE "esercizi_preferiti" (
    "utente_id" INTEGER NOT NULL,
    "esercizio_id" INTEGER NOT NULL,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esercizi_preferiti_pkey" PRIMARY KEY ("utente_id","esercizio_id")
);

-- AddForeignKey
ALTER TABLE "esercizi_preferiti" ADD CONSTRAINT "esercizi_preferiti_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esercizi_preferiti" ADD CONSTRAINT "esercizi_preferiti_esercizio_id_fkey" FOREIGN KEY ("esercizio_id") REFERENCES "esercizi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

