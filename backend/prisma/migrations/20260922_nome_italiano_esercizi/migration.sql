-- Nome italiano degli esercizi importati con nome inglese.
--
-- Il catalogo e' quasi tutto in inglese e questo lo rendeva inutilizzabile in
-- ricerca dentro un'app italiana: "affondo" restituiva zero risultati pur
-- essendoci 540 lunge a catalogo.
--
-- `nome` resta invariato: si aggiunge il nome italiano a fianco, cosi' in
-- interfaccia si puo' mostrare l'italiano come principale e conservare
-- l'inglese come riferimento (e' quello che si cerca nei video).
ALTER TABLE "esercizi" ADD COLUMN "nome_it" TEXT;

-- La ricerca interroga entrambi i nomi: senza indice sarebbe una scansione
-- completa su 3313 righe a ogni battitura.
CREATE INDEX "esercizi_nome_it_idx" ON "esercizi"("nome_it");
