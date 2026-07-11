-- AlterTable: Aggiunge Google Place ID alla tabella palestre
ALTER TABLE "palestre" ADD COLUMN "google_place_id" TEXT;

-- CreateTable: Tabella affluenza palestra (dati scraping Google Maps)
CREATE TABLE "affluenza_palestra" (
    "id" SERIAL NOT NULL,
    "palestra_id" INTEGER NOT NULL,
    "giorno_settimana" INTEGER NOT NULL,
    "ora" INTEGER NOT NULL,
    "livello_percentuale" INTEGER NOT NULL,
    "live_livello" INTEGER,
    "live_descrizione" TEXT,
    "aggiornato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affluenza_palestra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unico per palestra + giorno + ora
CREATE UNIQUE INDEX "affluenza_palestra_palestra_id_giorno_settimana_ora_key" ON "affluenza_palestra"("palestra_id", "giorno_settimana", "ora");

-- AddForeignKey
ALTER TABLE "affluenza_palestra" ADD CONSTRAINT "affluenza_palestra_palestra_id_fkey" FOREIGN KEY ("palestra_id") REFERENCES "palestre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
