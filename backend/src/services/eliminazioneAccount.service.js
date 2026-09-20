// ============================================
// GymMaster — Eliminazione Account
// Cancellazione definitiva dei dati di un utente
// ============================================

import prisma from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Elimina definitivamente un account e i dati collegati.
 *
 * Non basta una singola delete: cinque vincoli di chiave esterna sono in
 * RESTRICT (schede create, sessioni, record personali, messaggi inviati e
 * allenamenti programmati da questo utente) e bloccherebbero l'operazione.
 * Vanno quindi sciolti nell'ordine giusto, dentro un'unica transazione: o
 * l'account sparisce del tutto, o non cambia nulla.
 *
 * Il principio seguito e' che cancellare un account non deve danneggiare gli
 * altri utenti: cio' che appartiene solo a questa persona viene rimosso, cio'
 * su cui altri hanno costruito la propria storia di allenamento viene
 * conservato ma scollegato da lei.
 *
 * @returns {Promise<object>} conteggi di cosa e' stato rimosso o trasferito
 */
export async function eliminaAccount(utenteId) {
  return prisma.$transaction(async (tx) => {
    const riepilogo = {};

    // 1. Sessioni di allenamento. Le serie registrate spariscono a cascata e
    //    gli allenamenti in calendario che vi puntavano si limitano a perdere
    //    il collegamento (SET NULL).
    riepilogo.sessioni = (await tx.sessioneAllenamento.deleteMany({ where: { utenteId } })).count;

    // 2. Record personali e misurazioni: dati strettamente personali
    riepilogo.recordPersonali = (await tx.recordPersonale.deleteMany({ where: { utenteId } })).count;

    // 3. Messaggi inviati. Cancellarli e' il comportamento corretto per una
    //    richiesta di cancellazione: sono contenuti scritti da questa persona.
    riepilogo.messaggi = (await tx.messaggio.deleteMany({ where: { mittenteId: utenteId } })).count;

    // 4. Conversazioni che resterebbero senza interlocutori. Quelle con altri
    //    partecipanti restano in piedi per loro.
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

    // 5. Allenamenti programmati da questa persona nel calendario di ALTRI:
    //    restano dove sono, semplicemente senza autore. Cancellarli
    //    svuoterebbe l'agenda di qualcun altro.
    riepilogo.pianificazioniOrfane = (await tx.allenamentoPianificato.updateMany({
      where: { creatoDaId: utenteId, utenteId: { not: utenteId } },
      data: { creatoDaId: null }
    })).count;

    // 6. Schede create. Quelle su cui nessun altro si e' allenato vengono
    //    eliminate; le altre passano all'amministratore, perche' cancellarle
    //    cancellerebbe anche lo storico di chi le ha usate.
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
        // Senza un destinatario non si puo' procedere: meglio annullare tutto
        // che lasciare l'archivio in uno stato incoerente.
        throw new Error('Impossibile trasferire le schede in uso: nessun amministratore disponibile');
      }
      riepilogo.schedeTrasferite = (await tx.schedaAllenamento.updateMany({
        where: { id: { in: inUso } },
        data: { creatoreId: amministratore.id, visibilita: 'GLOBALE', assegnataDaPTId: null }
      })).count;
    }

    // 7. L'account. Tutto il resto (notifiche, iscrizioni PT, appuntamenti,
    //    misurazioni, token, collegamento Telegram, suggerimenti…) e' gia' in
    //    cascata e sparisce con lui.
    await tx.utente.delete({ where: { id: utenteId } });

    logger.info({ utenteId, ...riepilogo }, 'Account eliminato definitivamente');
    return riepilogo;
  }, { timeout: 30000 });
}
