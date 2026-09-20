-- Chi ha programmato un allenamento puo' cancellare il proprio account: con il
-- vincolo RESTRICT la cancellazione sarebbe bloccata, e cancellando a cascata
-- si svuoterebbe il calendario di un ALTRO utente. Rendendo il riferimento
-- nullabile il cliente conserva il suo programma, che resta semplicemente
-- senza autore.
ALTER TABLE "allenamenti_pianificati" ALTER COLUMN "creato_da_id" DROP NOT NULL;

ALTER TABLE "allenamenti_pianificati"
  DROP CONSTRAINT "allenamenti_pianificati_creato_da_id_fkey";

ALTER TABLE "allenamenti_pianificati"
  ADD CONSTRAINT "allenamenti_pianificati_creato_da_id_fkey"
  FOREIGN KEY ("creato_da_id") REFERENCES "utenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;
