// ============================================
// GymMaster — Crowd reports controller
// "How busy is the gym right now?", answered during a workout
// ============================================

import prisma from '../config/database.js';
import { ErroreNonTrovato, ErroreValidazione, ErroreNonAutorizzato, ErroreConflitto } from '../utils/errori.js';
import { FUSO_ORARIO, orarioLocale } from '../utils/date.js';
import { t } from '../i18n/index.js';
import { ORE_MASSIME_SESSIONE, MINUTI_TRA_SEGNALAZIONI } from '../utils/affluenzaSegnalata.js';

const giaSegnalata = () => new ErroreConflitto(t('affluenzaController.giaSegnalata'), { codice: 'GIA_SEGNALATA' });

/**
 * POST /api/v1/sessioni/:id/affluenza — { livello: 0-3 }
 * Only on one's own open workout, in its first ORE_MASSIME_SESSIONE hours,
 * once per workout (409 GIA_SEGNALATA) and once every MINUTI_TRA_SEGNALAZIONI
 * minutes per user (409 SEGNALAZIONE_RECENTE). The gym is the user's, taken
 * here, never from the app. Weekday and hour are the gym's (FUSO_ORARIO).
 */
export async function segnalaAffluenza(req, res, next) {
  try {
    const adesso = new Date();
    const sessione = await prisma.sessioneAllenamento.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, utenteId: true, dataInizio: true, dataFine: true, segnalazioneAffluenza: { select: { id: true } } }
    });
    if (!sessione) throw new ErroreNonTrovato(t('sessioniController.sessioneNonTrovata'));
    if (sessione.utenteId !== req.utente.id) throw new ErroreNonAutorizzato(t('sessioniController.nonPuoiAccedere'));
    if (sessione.segnalazioneAffluenza) throw giaSegnalata();
    if (sessione.dataFine) throw new ErroreValidazione(t('affluenzaController.allenamentoConcluso'));
    if (adesso - sessione.dataInizio > ORE_MASSIME_SESSIONE * 3600 * 1000) {
      throw new ErroreValidazione(t('affluenzaController.allenamentoTroppoVecchio', { count: ORE_MASSIME_SESSIONE }));
    }
    const palestraId = req.utente.palestraId;
    if (!palestraId) throw new ErroreValidazione(t('affluenzaController.senzaPalestra'));

    const recente = await prisma.segnalazioneAffluenza.findFirst({
      where: { utenteId: req.utente.id, istante: { gt: new Date(adesso.getTime() - MINUTI_TRA_SEGNALAZIONI * 60 * 1000) } },
      select: { id: true }
    });
    if (recente) {
      throw new ErroreConflitto(t('affluenzaController.segnalazioneRecente', { count: MINUTI_TRA_SEGNALAZIONI }), { codice: 'SEGNALAZIONE_RECENTE' });
    }

    const { giornoSettimana, ora } = orarioLocale(adesso, FUSO_ORARIO);
    try {
      await prisma.segnalazioneAffluenza.create({
        data: { utenteId: req.utente.id, palestraId, sessioneId: sessione.id, livello: req.body.livello, istante: adesso, giornoSettimana, ora }
      });
    } catch (errore) {
      // Two taps at once: the unique sessioneId lets only one through
      if (errore.code === 'P2002') throw giaSegnalata();
      throw errore;
    }

    res.status(201).json({ successo: true, dati: { affluenzaSegnalata: true } });
  } catch (errore) { next(errore); }
}
