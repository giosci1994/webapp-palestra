// ============================================
// GymMaster — Account deletion
// Permanent deletion of a user's data
// ============================================

import prisma from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Permanently deletes an account and its related data.
 *
 * A single delete is not enough: four foreign key constraints are RESTRICT
 * (plans created, workouts, personal records and messages sent) and would
 * block the operation. So they have to be untied in the right order, inside a
 * single transaction: either the account disappears entirely, or nothing
 * changes.
 *
 * The principle is that deleting an account must not harm the other users:
 * what belongs only to this person is removed, while what others have built
 * their own training history on is kept but unlinked from them.
 *
 * @returns {Promise<object>} counts of what was removed or transferred
 */
export async function eliminaAccount(utenteId) {
  return prisma.$transaction(async (tx) => {
    const riepilogo = {};

    // 1. Workouts. The logged sets go away by cascade, and the calendar
    //    entries that pointed to them just lose the link (SET NULL).
    riepilogo.sessioni = (await tx.sessioneAllenamento.deleteMany({ where: { utenteId } })).count;

    // 2. Personal records: strictly personal data
    riepilogo.recordPersonali = (await tx.recordPersonale.deleteMany({ where: { utenteId } })).count;

    // 3. Messages sent. Deleting them is the right behavior for a deletion
    //    request: they are content written by this person.
    riepilogo.messaggi = (await tx.messaggio.deleteMany({ where: { mittenteId: utenteId } })).count;

    // 4. Conversations that would be left with nobody to talk to. Those with
    //    other participants stay up for them.
    const partecipazioni = await tx.partecipanteChat.findMany({
      where: { utenteId },
      select: { conversazioneId: true }
    });
    const idConversazioni = partecipazioni.map(p => p.conversazioneId);
    if (idConversazioni.length > 0) {
      const conteggi = await tx.partecipanteChat.groupBy({
        by: ['conversazioneId'],
        where: { conversazioneId: { in: idConversazioni } },
        _count: { utenteId: true }
      });
      const daRimuovere = conteggi.filter(c => c._count.utenteId <= 1).map(c => c.conversazioneId);
      riepilogo.conversazioni = daRimuovere.length
        ? (await tx.conversazione.deleteMany({ where: { id: { in: daRimuovere } } })).count
        : 0;
    } else {
      riepilogo.conversazioni = 0;
    }

    // 5. Workouts this person scheduled in OTHER users' calendars: they stay
    //    where they are, just with no author. Deleting them would empty
    //    someone else's schedule.
    riepilogo.pianificazioniOrfane = (await tx.allenamentoPianificato.updateMany({
      where: { creatoDaId: utenteId, utenteId: { not: utenteId } },
      data: { creatoDaId: null }
    })).count;

    // 6. Plans created. Those nobody else has trained with are deleted; the
    //    others go to the administrator, so whoever trained with them keeps
    //    their workouts on the plan (deleted, they would become free workouts).
    const schede = await tx.schedaAllenamento.findMany({
      where: { creatoreId: utenteId },
      select: { id: true, _count: { select: { sessioni: true } } }
    });
    const inUso = schede.filter(s => s._count.sessioni > 0).map(s => s.id);
    const nonUsate = schede.filter(s => s._count.sessioni === 0).map(s => s.id);

    if (nonUsate.length > 0) {
      riepilogo.schedeEliminate = (await tx.schedaAllenamento.deleteMany({ where: { id: { in: nonUsate } } })).count;
    } else {
      riepilogo.schedeEliminate = 0;
    }

    riepilogo.schedeTrasferite = 0;
    if (inUso.length > 0) {
      const amministratore = await tx.utente.findFirst({
        where: { ruolo: 'SUPERADMIN', id: { not: utenteId } },
        select: { id: true }
      });
      if (!amministratore) {
        // Without a recipient we cannot go on: better to cancel everything
        // than to leave the data in an inconsistent state.
        throw new Error('Impossibile trasferire le schede in uso: nessun amministratore disponibile');
      }
      riepilogo.schedeTrasferite = (await tx.schedaAllenamento.updateMany({
        where: { id: { in: inUso } },
        data: { creatoreId: amministratore.id, visibilita: 'GLOBALE', assegnataDaPTId: null }
      })).count;
    }

    // 7. The account. Everything else (notifications, personal trainer
    //    memberships, appointments, measurements, tokens, Telegram link,
    //    suggestions…) already cascades and goes away with it.
    await tx.utente.delete({ where: { id: utenteId } });

    logger.info({ utenteId, ...riepilogo }, 'Account eliminato definitivamente');
    return riepilogo;
  }, { timeout: 30000 });
}
