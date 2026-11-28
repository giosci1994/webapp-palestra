// ============================================
// GymMaster — Plans: deleting and copying
// ============================================

import prisma from '../config/database.js';
import { chiudiAperta } from './conclusioneSessione.service.js';
import { normalizzaGruppi } from '../utils/superset.js';

/**
 * Deletes a plan and keeps the workouts done with it: they become free
 * workouts with the plan's name (the database empties their scheda_id, ON
 * DELETE SET NULL). Before, they went with the plan, and with them the
 * history, statistics and records of whoever had trained with it.
 * Its exercises and calendar entries go with it. Workouts still open on it
 * are closed first: the workout page needs the plan.
 * @returns {Promise<boolean>} false if the plan does not exist
 */
export async function eliminaScheda(id) {
  const scheda = await prisma.schedaAllenamento.findUnique({ where: { id }, select: { titolo: true } });
  if (!scheda) return false;

  const aperte = await prisma.sessioneAllenamento.findMany({ where: { schedaId: id, dataFine: null }, select: { id: true } });
  for (const aperta of aperte) await chiudiAperta(aperta.id);

  await prisma.$transaction([
    prisma.sessioneAllenamento.updateMany({ where: { schedaId: id, titolo: null }, data: { titolo: scheda.titolo } }),
    prisma.schedaAllenamento.delete({ where: { id } })
  ]);
  return true;
}

// Maps an exercise entry (from the client) to EsercizioScheda data, keeping
// the cardio fields (duration/speed/incline/resistance/distance + warm-up)
// and the superset group, already passed through normalizzaGruppi.
export function mappaEsercizioScheda(e, ordine) {
  return {
    esercizioId: e.esercizioId,
    serieTarget: e.serieTarget != null ? e.serieTarget : 3,
    repTarget: e.repTarget !== undefined ? e.repTarget : '8-12',
    recuperoSecondi: e.recuperoSecondi != null ? e.recuperoSecondi : 90,
    ordineEsecuzione: ordine,
    gruppo: e.gruppo ?? null,
    note: e.note?.trim() || null,
    riscaldamento: !!e.riscaldamento,
    durataMinuti: e.durataMinuti != null ? e.durataMinuti : null,
    velocitaKmh: e.velocitaKmh != null ? e.velocitaKmh : null,
    inclinazione: e.inclinazione != null ? e.inclinazione : null,
    livelloResistenza: e.livelloResistenza != null ? e.livelloResistenza : null,
    distanzaKm: e.distanzaKm != null ? e.distanzaKm : null
  };
}

/**
 * The exercises of an existing plan as create data for a copy: same order
 * (renumbered from 1), superset groups, notes, warm-up and cardio targets.
 * Used both when a user clones a plan and when a trainer assigns one to a
 * client, so the two copies cannot drift apart again (the assigned copy used
 * to lose the notes and the cardio fields).
 */
export function copiaEserciziScheda(esercizi) {
  const ordinati = [...esercizi].sort((a, b) => a.ordineEsecuzione - b.ordineEsecuzione);
  return normalizzaGruppi(ordinati).map((e, i) => mappaEsercizioScheda(e, i + 1));
}
