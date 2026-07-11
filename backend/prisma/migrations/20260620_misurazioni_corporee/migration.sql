-- Misurazioni della composizione corporea (serie temporale)
CREATE TABLE "misurazioni_corporee" (
  "id" SERIAL NOT NULL,
  "utente_id" INTEGER NOT NULL,
  "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "peso" DOUBLE PRECISION,
  "bmi" DOUBLE PRECISION,
  "grasso_corporeo_pct" DOUBLE PRECISION,
  "muscolo_scheletrico_pct" DOUBLE PRECISION,
  "massa_magra_kg" DOUBLE PRECISION,
  "grasso_sottocutaneo_pct" DOUBLE PRECISION,
  "grasso_viscerale" DOUBLE PRECISION,
  "acqua_pct" DOUBLE PRECISION,
  "massa_muscolare_kg" DOUBLE PRECISION,
  "massa_ossea_kg" DOUBLE PRECISION,
  "proteine_pct" DOUBLE PRECISION,
  "bmr" INTEGER,
  "eta_metabolica" INTEGER,
  "note" TEXT,
  "inserita_da_pt_id" INTEGER,
  "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "misurazioni_corporee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "misurazioni_corporee_utente_id_data_idx" ON "misurazioni_corporee"("utente_id", "data");

ALTER TABLE "misurazioni_corporee"
  ADD CONSTRAINT "misurazioni_corporee_utente_id_fkey"
  FOREIGN KEY ("utente_id") REFERENCES "utenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;
