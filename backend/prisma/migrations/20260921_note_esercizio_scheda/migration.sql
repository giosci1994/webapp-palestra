-- Indicazione tecnica per esercizio dentro una scheda (correzioni posturali,
-- tempi, esecuzione unilaterale). Sta sulla riga della scheda e non
-- sull'esercizio perche' la stessa alzata puo' avere indicazioni diverse in
-- schede diverse.
ALTER TABLE "esercizi_scheda" ADD COLUMN "note" TEXT;
