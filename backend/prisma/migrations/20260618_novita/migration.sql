-- CreateTable: novità in-app (storie) gestite dall'admin
CREATE TABLE "novita" (
    "id" SERIAL NOT NULL,
    "titolo" TEXT NOT NULL,
    "sottotitolo" TEXT,
    "punti" TEXT,
    "icona" TEXT,
    "immagine" TEXT,
    "cta_testo" TEXT,
    "cta_rotta" TEXT,
    "colore_inizio" TEXT,
    "colore_fine" TEXT,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novita_pkey" PRIMARY KEY ("id")
);
