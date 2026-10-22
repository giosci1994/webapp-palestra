// ============================================
// GymMaster — Deleting a plan
// ============================================

import prisma from '../config/database.js';
import { chiudiAperta } from './conclusioneSessione.service.js';

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
