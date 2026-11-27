// ============================================
// GymMaster — Supersets and circuits in the plan editors
// ============================================
//
// The pieces both editors use (CreaScheda and the trainer's plan form in
// DashboardPT): the box around a group with its rounds and rest after the
// round, and the join and split buttons. The list itself is changed by the
// functions in utils/superset.js.

import { Link2, Unlink } from 'lucide-react';
import { useLingua } from '../../hooks/useLingua.js';

/**
 * The box around the members of a superset (2) or circuit (3+).
 * `giri` is the members' common number of sets, or null when they differ.
 */
export function RiquadroGruppo({ lettera, membri, giri, recuperoGiro, onGiri, onRecuperoGiro, children }) {
  const { t } = useLingua();
  const titolo = membri === 2 ? t('creaScheda.superset', { lettera }) : t('creaScheda.circuito', { lettera });
  const idCampo = `gruppo-${lettera}`;
  return (
    <section className="riquadro-superset" aria-label={titolo}>
      <div className="riquadro-superset-intestazione">
        <span className="riquadro-superset-titolo">
          <Link2 size={16} aria-hidden="true" />
          {titolo}
        </span>
        <div className="riquadro-superset-campi">
          <div className="esercizio-param-gruppo">
            <label htmlFor={`${idCampo}-giri`} className="esercizio-param-label">{t('creaScheda.giri')}</label>
            <input id={`${idCampo}-giri`} type="number" value={giri ?? ''} placeholder={giri == null ? '–' : undefined}
                   title={giri == null ? t('creaScheda.giriDiversi') : undefined}
                   onChange={e => onGiri(e.target.value)}
                   className="esercizio-param-input" style={{ width: '52px' }} min={1} max={10} />
          </div>
          <div className="esercizio-param-gruppo">
            <label htmlFor={`${idCampo}-recupero`} className="esercizio-param-label">{t('creaScheda.recuperoDopoGiro')}</label>
            <span className="flex items-center gap-1.5">
              <input id={`${idCampo}-recupero`} type="number" value={recuperoGiro ?? ''}
                     onChange={e => onRecuperoGiro(e.target.value)}
                     className="esercizio-param-input" style={{ width: '64px' }} step={15} min={0} />
              <span className="esercizio-param-unita">s</span>
            </span>
          </div>
        </div>
      </div>
      <div className="riquadro-superset-membri">{children}</div>
    </section>
  );
}

/** Between two entries: joins the first with the next one */
export function PulsanteUnisci({ nome, prossimo, onClick }) {
  const { t } = useLingua();
  return (
    <button type="button" onClick={onClick} className="btn-unisci-superset"
            aria-label={t('creaScheda.unisciAria', { nome, prossimo })}>
      <Link2 size={16} aria-hidden="true" />
      {t('creaScheda.unisci')}
    </button>
  );
}

/** On a member: takes it out of its group */
export function PulsanteSepara({ nome, onClick }) {
  const { t } = useLingua();
  return (
    <button type="button" onClick={onClick} className="btn-separa-superset"
            aria-label={t('creaScheda.separaAria', { nome })} title={t('creaScheda.separaAria', { nome })}>
      <Unlink size={16} aria-hidden="true" />
      <span className="hidden sm:inline">{t('creaScheda.separa')}</span>
    </button>
  );
}
