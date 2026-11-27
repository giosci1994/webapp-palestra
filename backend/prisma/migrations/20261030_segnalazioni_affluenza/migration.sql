-- Crowd levels reported by users during a workout: one per workout, with the
-- weekday and hour in the gym's time zone. They go away with the user, the
-- gym or the workout.

-- CreateTable
CREATE TABLE "segnalazioni_affluenza" (
    "id" SERIAL NOT NULL,
    "utente_id" INTEGER NOT NULL,
    "palestra_id" INTEGER NOT NULL,
    "sessione_id" INTEGER NOT NULL,
    "livello" INTEGER NOT NULL,
    "istante" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "giorno_settimana" INTEGER NOT NULL,
    "ora" INTEGER NOT NULL,

    CONSTRAINT "segnalazioni_affluenza_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "segnalazioni_affluenza_sessione_id_key" ON "segnalazioni_affluenza"("sessione_id");

-- CreateIndex
CREATE INDEX "segnalazioni_affluenza_palestra_id_giorno_settimana_ora_ist_idx" ON "segnalazioni_affluenza"("palestra_id", "giorno_settimana", "ora", "istante");

-- CreateIndex
CREATE INDEX "segnalazioni_affluenza_palestra_id_istante_idx" ON "segnalazioni_affluenza"("palestra_id", "istante");

-- CreateIndex
CREATE INDEX "segnalazioni_affluenza_utente_id_istante_idx" ON "segnalazioni_affluenza"("utente_id", "istante");

-- AddForeignKey
ALTER TABLE "segnalazioni_affluenza" ADD CONSTRAINT "segnalazioni_affluenza_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segnalazioni_affluenza" ADD CONSTRAINT "segnalazioni_affluenza_palestra_id_fkey" FOREIGN KEY ("palestra_id") REFERENCES "palestre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segnalazioni_affluenza" ADD CONSTRAINT "segnalazioni_affluenza_sessione_id_fkey" FOREIGN KEY ("sessione_id") REFERENCES "sessioni_allenamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

