-- AlterTable: Aggiunge destinatario opzionale agli annunci PT
ALTER TABLE "annunci_pt" ADD COLUMN "destinatario_id" INTEGER;

-- AlterTable: Aggiunge tracciamento PT alle schede assegnate
ALTER TABLE "schede_allenamento" ADD COLUMN "assegnata_da_pt_id" INTEGER;

-- AddForeignKey
ALTER TABLE "schede_allenamento" ADD CONSTRAINT "schede_allenamento_assegnata_da_pt_id_fkey" FOREIGN KEY ("assegnata_da_pt_id") REFERENCES "utenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annunci_pt" ADD CONSTRAINT "annunci_pt_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "utenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;
