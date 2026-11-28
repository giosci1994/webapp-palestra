// ============================================
// GymMaster — Plan creation component
// Modal to create a new workout plan
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { indicizzaEsercizi, cerca, preferitiPrima } from '../../utils/ricerca.js';
import { usePreferiti } from '../../hooks/usePreferiti.js';
import { useAPezzi } from '../../hooks/useAPezzi.js';
import { nomeEsercizio, nomeGruppo, nomeAttrezzatura, formattaNumero } from '../../utils/formattatori.js';
import { useLingua } from '../../hooks/useLingua.js';
import Testo from '../../i18n/Testo.jsx';
import { api } from '../../config/api.js';
import { GRUPPI_MUSCOLARI, LIVELLI, RIPETIZIONI_MASSIME, TITOLO_MASSIMO } from '../../utils/costanti.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  normalizzaGruppi, gruppiDi, blocchiDi, puoUnire, unisci, separa, impostaGiri, giriDi, ultimoDelGruppo,
  sposta, leggiSecondi, letteraGruppo, eCardioOriscaldamento
} from '../../utils/superset.js';
import { RiquadroGruppo, PulsanteUnisci, PulsanteSepara } from './SupersetEditor.jsx';

export default function CreaScheda({ onChiudi, onCreata, schedaEsistente = null }) {
  const { t } = useLingua();
  const [step, setStep] = useState(1); // 1: basic info, 2: add exercises
  const [form, setForm] = useState(
    schedaEsistente 
      ? { titolo: schedaEsistente.titolo, descrizione: schedaEsistente.descrizione || '', livello: schedaEsistente.livello, visibilita: schedaEsistente.visibilita }
      : { titolo: '', descrizione: '', livello: 'BASE', visibilita: 'PERSONALE' }
  );
  const [eserciziSelezionati, setEserciziSelezionati] = useState(
    schedaEsistente && schedaEsistente.esercizi 
      ? normalizzaGruppi(schedaEsistente.esercizi.map(es => ({
          esercizioId: es.esercizioId,
          nome: nomeEsercizio(es.esercizio),
          // Superset or circuit (utils/superset.js)
          gruppo: es.gruppo ?? null,
          serieTarget: es.serieTarget,
          repTarget: es.repTarget,
          recuperoSecondi: es.recuperoSecondi,
          note: es.note || '',
          // Cardio fields (kept for the entries created by the bot)
          riscaldamento: es.riscaldamento,
          durataMinuti: es.durataMinuti,
          velocitaKmh: es.velocitaKmh,
          inclinazione: es.inclinazione,
          livelloResistenza: es.livelloResistenza,
          distanzaKm: es.distanzaKm
        })))
      : []
  );
  const [eserciziCatalogo, setEserciziCatalogo] = useState([]);
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  // Load the exercise catalog
  useEffect(() => {
    api.get('/esercizi').then(r => setEserciziCatalogo(r.dati || [])).catch(() => {});
  }, []);

  // Tolerant search (utils/ricerca.js): the index is built once.
  // The user's favorites (star in the catalog) come first
  const { preferiti } = usePreferiti();
  const indiceRicerca = useMemo(() => indicizzaEsercizi(eserciziCatalogo), [eserciziCatalogo]);
  const eserciziFiltrati = useMemo(
    () => preferitiPrima(cerca(indiceRicerca, ricerca).filter(e => !filtroGruppo || e.gruppoMuscoloPrimario === filtroGruppo), preferiti),
    [indiceRicerca, ricerca, filtroGruppo, preferiti]
  );
  const { visibili: eserciziVisibili, restanti, mostraAltri } = useAPezzi(eserciziFiltrati);

  const gruppiUnici = [...new Set(eserciziCatalogo.map(e => e.gruppoMuscoloPrimario))].sort();

  const toggleEsercizio = (esercizio) => {
    setEserciziSelezionati(prev => {
      const esiste = prev.find(e => e.esercizioId === esercizio.id);
      if (esiste) return normalizzaGruppi(prev.filter(e => e.esercizioId !== esercizio.id));
      return [...prev, {
        esercizioId: esercizio.id,
        nome: nomeEsercizio(esercizio),
        gruppo: null,
        serieTarget: 3,
        repTarget: '8-12',
        recuperoSecondi: 90,
        note: ''
      }];
    });
  };

  const aggiornaPianoEsercizio = (idx, campo, valore) => {
    setEserciziSelezionati(prev => prev.map((e, i) =>
      i === idx ? { ...e, [campo]: valore } : e
    ));
  };

  // Move an exercise up or down in the list: away from the other members
  // of its superset it leaves the group (utils/superset.js)
  const spostaEsercizio = (idx, direzione) => {
    setEserciziSelezionati(prev => sposta(prev, idx, direzione));
  };

  const etichetteGruppi = gruppiDi(eserciziSelezionati);

  // One selected exercise. In a group its number becomes A1, A2..., its rest
  // is the pause before the next member, and the last member's rest is set on
  // the group's box (rest after the round)
  const schedaEsercizio = (idx) => {
    const es = eserciziSelezionati[idx];
    const posto = etichetteGruppi[idx];
    return (
      <div className="esercizio-selezionato-card">
        {/* Exercise name row */}
        <div className="esercizio-sel-header">
          {/* Reorder arrows */}
          <div className="flex flex-col shrink-0">
            <button
              onClick={() => spostaEsercizio(idx, -1)}
              disabled={idx === 0}
              className="btn-freccia-ordine"
              title={t('creaScheda.spostaSu')}
              aria-label={t('creaScheda.spostaSu')}
            >▲</button>
            <button
              onClick={() => spostaEsercizio(idx, 1)}
              disabled={idx === eserciziSelezionati.length - 1}
              className="btn-freccia-ordine"
              title={t('creaScheda.spostaGiu')}
              aria-label={t('creaScheda.spostaGiu')}
            >▼</button>
          </div>
          <span className="esercizio-sel-numero">{posto ? posto.etichetta : idx + 1}</span>
          <span className="esercizio-sel-nome">{es.nome}</span>
          {posto && <PulsanteSepara nome={es.nome} onClick={() => setEserciziSelezionati(prev => separa(prev, idx))} />}
          <button onClick={() => toggleEsercizio({ id: es.esercizioId })}
                  className="text-[var(--pericolo)] text-sm px-1 hover:scale-110 transition-transform shrink-0"
                  title={t('creaScheda.rimuoviEsercizio')} aria-label={t('creaScheda.rimuoviEsercizio')}>✕</button>
        </div>

        {/* Parameters row */}
        <div className="esercizio-sel-parametri flex-wrap">
          <div className="esercizio-param-gruppo">
            <label className="esercizio-param-label">{t('creaScheda.serie')}</label>
            <input type="number" value={es.serieTarget} onChange={e => aggiornaPianoEsercizio(idx, 'serieTarget', e.target.value)}
                   className="esercizio-param-input" style={{ width: '52px' }} min={1} max={10} />
          </div>
          <span className="esercizio-param-sep">×</span>
          <div className="esercizio-param-gruppo">
            <label className="esercizio-param-label">{t('creaScheda.rep')}</label>
            <input type="text" value={es.repTarget ?? ''} onChange={e => aggiornaPianoEsercizio(idx, 'repTarget', e.target.value)}
                   maxLength={RIPETIZIONI_MASSIME} className="esercizio-param-input" style={{ width: '64px' }} />
          </div>
          {/* The last member's rest is the rest after the round, on the group's box */}
          {!posto?.ultimo && (
            <div className="esercizio-param-gruppo ml-auto">
              <label className="esercizio-param-label">{posto ? t('creaScheda.pausaTraEsercizi') : t('creaScheda.recupero')}</label>
              <input type="number" value={es.recuperoSecondi} onChange={e => aggiornaPianoEsercizio(idx, 'recuperoSecondi', e.target.value)}
                     className="esercizio-param-input" style={{ width: '64px' }} step={15} min={0} />
              <span className="esercizio-param-unita">s</span>
            </div>
          )}
        </div>

        {/* Technique note: posture corrections, tempo,
            one-sided execution. Optional. */}
        <input
          type="text"
          value={es.note || ''}
          onChange={e => aggiornaPianoEsercizio(idx, 'note', e.target.value)}
          placeholder={t('creaScheda.notaTecnica')}
          className="w-full mt-2 px-3 py-2 rounded-[var(--raggio-sm)] text-xs bg-[var(--bg-terziario)] text-[var(--testo-primario)] border border-[var(--bordo-light)] focus:border-[var(--accent)] focus:outline-none"
        />
      </div>
    );
  };

  const gestisciCrea = async () => {
    setCaricamento(true);
    try {
      const payload = {
        ...form,
        esercizi: eserciziSelezionati.map(e => {
          if (eCardioOriscaldamento(e)) {
            return {
              esercizioId: e.esercizioId,
              serieTarget: e.serieTarget ?? 1,
              repTarget: e.repTarget ?? null,
              recuperoSecondi: e.recuperoSecondi ?? 0,
              gruppo: e.gruppo ?? null,
              riscaldamento: !!e.riscaldamento,
              durataMinuti: e.durataMinuti ?? null,
              velocitaKmh: e.velocitaKmh ?? null,
              inclinazione: e.inclinazione ?? null,
              livelloResistenza: e.livelloResistenza ?? null,
              distanzaKm: e.distanzaKm ?? null
            };
          }
          return {
            esercizioId: e.esercizioId,
            serieTarget: parseInt(e.serieTarget),
            repTarget: e.repTarget,
            // 0 is a valid rest (no pause before the next member)
            recuperoSecondi: leggiSecondi(e.recuperoSecondi),
            gruppo: e.gruppo ?? null,
            note: e.note?.trim() || null
          };
        })
      };
      let risposta;
      if (schedaEsistente) {
        risposta = await api.put(`/schede/${schedaEsistente.id}`, payload);
      } else {
        risposta = await api.post('/schede', payload);
      }
      onCreata(risposta.dati);
    } catch (err) {
      alert(err.message);
    } finally {
      setCaricamento(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }}
      onClick={(e) => e.target === e.currentTarget && onChiudi()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--ombra-modale)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--bordo)]">
          <h2 className="text-xl font-bold">
            {schedaEsistente ? t('creaScheda.modificaScheda') : (step === 1 ? t('creaScheda.nuovaScheda') : t('creaScheda.aggiungiEsercizi'))}
          </h2>
          <button onClick={onChiudi} className="text-[var(--testo-terziario)] hover:text-[var(--testo-primario)] text-xl p-1">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 ? (
            /* Step 1: Basic info */
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('creaScheda.titoloCampo')}</label>
                <input type="text" value={form.titolo} onChange={e => setForm(p => ({...p, titolo: e.target.value}))}
                       maxLength={TITOLO_MASSIMO} className="campo-input" placeholder={t('creaScheda.titoloPlaceholder')} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('creaScheda.descrizione')}</label>
                <textarea value={form.descrizione} onChange={e => setForm(p => ({...p, descrizione: e.target.value}))}
                          className="campo-input" rows={2} placeholder={t('creaScheda.descrizionePlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('creaScheda.livello')}</label>
                  <select value={form.livello} onChange={e => setForm(p => ({...p, livello: e.target.value}))} className="campo-input">
                    <option value="BASE">{t(LIVELLI.BASE.label)}</option>
                    <option value="INTERMEDIO">{t(LIVELLI.INTERMEDIO.label)}</option>
                    <option value="AVANZATO">{t(LIVELLI.AVANZATO.label)}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('creaScheda.visibilita')}</label>
                  <select value={form.visibilita} onChange={e => setForm(p => ({...p, visibilita: e.target.value}))} className="campo-input">
                    <option value="PERSONALE">{t('creaScheda.personale')}</option>
                    <option value="GLOBALE">{t('creaScheda.globale')}</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            /* Step 2: Add exercises */
            <div className="flex flex-col gap-5">
              {/* Selected exercises */}
              {eserciziSelezionati.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[var(--testo-secondario)] mb-3">
                    <Testo t="creaScheda.selezionati" valori={{ numero: eserciziSelezionati.length }}
                           componenti={{ piccolo: <span className="text-[10px] font-normal text-[var(--testo-terziario)]" /> }} />
                  </h3>
                  <div className="flex flex-col gap-3">
                    <AnimatePresence initial={false}>
                      {blocchiDi(eserciziSelezionati).map(blocco => {
                        const ultimoIdx = blocco.indici[blocco.indici.length - 1];
                        const unisciDopo = puoUnire(eserciziSelezionati, ultimoIdx) && (
                          <PulsanteUnisci nome={eserciziSelezionati[ultimoIdx].nome} prossimo={eserciziSelezionati[ultimoIdx + 1].nome}
                                          onClick={() => setEserciziSelezionati(prev => unisci(prev, ultimoIdx))} />
                        );
                        const animazione = {
                          layout: true,
                          initial: { opacity: 0, y: -8 },
                          animate: { opacity: 1, y: 0 },
                          exit: { opacity: 0, scale: 0.95 },
                          transition: { type: 'spring', stiffness: 400, damping: 30 }
                        };
                        if (blocco.gruppo == null) {
                          return (
                            <motion.div key={`e-${eserciziSelezionati[ultimoIdx].esercizioId}`} {...animazione} className="flex flex-col gap-3">
                              {schedaEsercizio(ultimoIdx)}
                              {unisciDopo}
                            </motion.div>
                          );
                        }
                        const ultimo = ultimoDelGruppo(eserciziSelezionati, blocco.gruppo);
                        return (
                          <motion.div key={`g-${eserciziSelezionati[blocco.indici[0]].esercizioId}`} {...animazione} className="flex flex-col gap-3">
                            <RiquadroGruppo
                              lettera={letteraGruppo(blocco.gruppo)}
                              membri={blocco.indici.length}
                              giri={giriDi(eserciziSelezionati, blocco.gruppo)}
                              recuperoGiro={eserciziSelezionati[ultimo].recuperoSecondi}
                              onGiri={v => setEserciziSelezionati(prev => impostaGiri(prev, blocco.gruppo, v))}
                              onRecuperoGiro={v => aggiornaPianoEsercizio(ultimo, 'recuperoSecondi', v)}
                            >
                              {blocco.indici.map(idx => <div key={eserciziSelezionati[idx].esercizioId}>{schedaEsercizio(idx)}</div>)}
                            </RiquadroGruppo>
                            {unisciDopo}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Highlighted muscle group filter */}
              <div className="crea-scheda-filtro-gruppo">
                <label className="text-sm font-semibold text-[var(--testo-primario)] mb-2 block">{t('creaScheda.filtraPerGruppo')}</label>
                <div className="crea-scheda-gruppi-wrap">
                  <button
                    onClick={() => setFiltroGruppo('')}
                    className={`crea-scheda-gruppo-btn ${!filtroGruppo ? 'attivo' : ''}`}
                  >{t('comune.tutti')}</button>
                  {gruppiUnici.map(g => {
                    const info = GRUPPI_MUSCOLARI[g];
                    return (
                      <button key={g}
                        onClick={() => setFiltroGruppo(g === filtroGruppo ? '' : g)}
                        className={`crea-scheda-gruppo-btn ${filtroGruppo === g ? 'attivo' : ''}`}
                        style={filtroGruppo === g && info ? { borderColor: info.colore, background: `${info.colore}22` } : {}}
                      >
                        {info?.emoji && <span>{info.emoji}</span>}
                        {nomeGruppo(g)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search bar */}
              <input type="text" value={ricerca} onChange={e => setRicerca(e.target.value)}
                     className="campo-input campo-ricerca" placeholder={t('creaScheda.cercaEsercizio')} />

              {/* Exercise catalog */}
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                {eserciziFiltrati.length === 0 ? (
                  <div className="text-center py-6 text-[var(--testo-terziario)]">{t('creaScheda.nessunEsercizio')}</div>
                ) : eserciziVisibili.map(es => {
                  const selezionato = eserciziSelezionati.some(e => e.esercizioId === es.id);
                  return (
                    <button key={es.id} onClick={() => toggleEsercizio(es)}
                            className={`flex items-center gap-3 p-2.5 rounded-[var(--raggio-md)] text-left transition-all text-sm ${
                              selezionato ? 'bg-[var(--accent-dim)] border border-[var(--accent)]' : 'hover:bg-[var(--bg-terziario)]'
                            }`}>
                      <span className="text-lg">{selezionato ? '✅' : '➕'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{preferiti.has(es.id) && <span title={t('creaScheda.preferito')}>⭐ </span>}{nomeEsercizio(es)}</p>
                        <p className="text-xs text-[var(--testo-terziario)]">
                          {nomeGruppo(es.gruppoMuscoloPrimario)} {es.attrezzatura ? `· ${nomeAttrezzatura(es.attrezzatura.nome)}` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {restanti > 0 && (
                  <button onClick={mostraAltri} className="text-sm text-[var(--accent)] py-2 hover:underline">
                    {t('creaScheda.mostraAltri', { numero: formattaNumero(restanti) })}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-[var(--bordo)]">
          {step === 2 ? (
            <button onClick={() => setStep(1)} className="btn-secondario">{t('creaScheda.indietro')}</button>
          ) : <div />}
          {step === 1 ? (
            <button onClick={() => setStep(2)} disabled={!form.titolo.trim()} className="btn-primario">
              {t('creaScheda.aggiungiEserciziAvanti')}
            </button>
          ) : (
            <button onClick={gestisciCrea} disabled={caricamento} className="btn-primario">
              {caricamento
                ? t('creaScheda.salvataggio')
                : (schedaEsistente
                  ? t('creaScheda.salvaModifiche', { numero: eserciziSelezionati.length })
                  : t('creaScheda.creaScheda', { numero: eserciziSelezionati.length }))}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
