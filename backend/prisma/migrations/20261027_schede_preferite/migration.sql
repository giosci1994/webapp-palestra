-- Plans marked with the star by each user (the favourite plans), as
-- esercizi_preferiti does for exercises.

-- CreateTable
CREATE TABLE "schede_preferite" (
    "utente_id" INTEGER NOT NULL,
    "scheda_id" INTEGER NOT NULL,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schede_preferite_pkey" PRIMARY KEY ("utente_id","scheda_id")
);

-- CreateIndex
CREATE INDEX "schede_preferite_scheda_id_idx" ON "schede_preferite"("scheda_id");

-- AddForeignKey
ALTER TABLE "schede_preferite" ADD CONSTRAINT "schede_preferite_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schede_preferite" ADD CONSTRAINT "schede_preferite_scheda_id_fkey" FOREIGN KEY ("scheda_id") REFERENCES "schede_allenamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
