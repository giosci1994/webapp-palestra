// ============================================
// GymMaster — Onboarding Wizard (First Login)
// 6 steps to complete the profile
// ============================================

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Camera, Calendar, Ruler, Target, Shield,
  ChevronRight, ChevronLeft, Check, AlertCircle, Sparkles, Award, Briefcase
} from 'lucide-react';
import RitaglioFoto from '../componenti/comuni/RitaglioFoto.jsx';
import { useLingua } from '../hooks/useLingua.js';
import Testo from '../i18n/Testo.jsx';

// Specializations offered to Personal Trainers (chip picker). `valore` is what
// is saved on the profile (and compared); `chiave` is the translation key of
// the label shown on the chip.
const SPECIALIZZAZIONI_PRESET = [
  { valore: 'Ipertrofia/Massa', chiave: 'onboarding.specializzazioni.ipertrofia' },
  { valore: 'Dimagrimento', chiave: 'onboarding.specializzazioni.dimagrimento' },
  { valore: 'Forza', chiave: 'onboarding.specializzazioni.forza' },
  { valore: 'Funzionale', chiave: 'onboarding.specializzazioni.funzionale' },
  { valore: 'Riabilitazione', chiave: 'onboarding.specializzazioni.riabilitazione' },
  { valore: 'Preparazione atletica', chiave: 'onboarding.specializzazioni.preparazioneAtletica' },
  { valore: 'Posturale', chiave: 'onboarding.specializzazioni.posturale' },
  { valore: 'Bodybuilding', chiave: 'onboarding.specializzazioni.bodybuilding' },
  { valore: 'Cross training', chiave: 'onboarding.specializzazioni.crossTraining' },
  { valore: 'Senior/Terza età', chiave: 'onboarding.specializzazioni.senior' },
  { valore: 'Pre/Post parto', chiave: 'onboarding.specializzazioni.prePostParto' },
  { valore: 'Mobilità', chiave: 'onboarding.specializzazioni.mobilita' }
];

// Step definitions (config) and sequences per account type
// (`titolo` and `desc` are translation keys, shown with t() when rendering)
const PASSI = {
  tipo:      { icona: User, titolo: 'onboarding.passi.tipo.titolo', desc: 'onboarding.passi.tipo.desc' },
  foto:      { icona: Camera, titolo: 'onboarding.passi.foto.titolo', desc: 'onboarding.passi.foto.desc' },
  dati:      { icona: Calendar, titolo: 'onboarding.passi.dati.titolo', desc: 'onboarding.passi.dati.desc' },
  misure:    { icona: Ruler, titolo: 'onboarding.passi.misure.titolo', desc: 'onboarding.passi.misure.desc' },
  obiettivo: { icona: Target, titolo: 'onboarding.passi.obiettivo.titolo', desc: 'onboarding.passi.obiettivo.desc' },
  pro1:      { icona: Award, titolo: 'onboarding.passi.pro1.titolo', desc: 'onboarding.passi.pro1.desc' },
  pro2:      { icona: Briefcase, titolo: 'onboarding.passi.pro2.titolo', desc: 'onboarding.passi.pro2.desc' },
  privacy:   { icona: Shield, titolo: 'onboarding.passi.privacy.titolo', desc: 'onboarding.passi.privacy.desc' },
};
const SEQ_UTENTE = ['tipo', 'foto', 'dati', 'misure', 'obiettivo', 'privacy'];
const SEQ_PT     = ['tipo', 'foto', 'dati', 'pro1', 'pro2', 'privacy'];

// `label` and `desc` are translation keys, shown with t() when rendering
const OBIETTIVI = [
  { id: 'massa', label: 'onboarding.obiettivi.massa.titolo', emoji: '💪', desc: 'onboarding.obiettivi.massa.desc' },
  { id: 'definizione', label: 'onboarding.obiettivi.definizione.titolo', emoji: '🔥', desc: 'onboarding.obiettivi.definizione.desc' },
  { id: 'forza', label: 'onboarding.obiettivi.forza.titolo', emoji: '🏋️', desc: 'onboarding.obiettivi.forza.desc' },
  { id: 'resistenza', label: 'onboarding.obiettivi.resistenza.titolo', emoji: '🏃', desc: 'onboarding.obiettivi.resistenza.desc' },
  { id: 'salute', label: 'onboarding.obiettivi.salute.titolo', emoji: '❤️', desc: 'onboarding.obiettivi.salute.desc' },
  { id: 'altro', label: 'onboarding.obiettivi.altro.titolo', emoji: '✨', desc: 'onboarding.obiettivi.altro.desc' },
];

export default function Onboarding() {
  const { t } = useLingua();
  const { utente, aggiornaUtente } = useAuth();
  const naviga = useNavigate();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(0);
  const [direzione, setDirezione] = useState(1);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState('');
  const [fotoDaRitagliare, setFotoDaRitagliare] = useState(null);

  const [form, setForm] = useState({
    tipoAccount: 'UTENTE',
    immagineProfilo: utente?.immagineProfilo || null,
    dataNascita: '',
    genere: '',
    pesoKg: '',
    altezzaCm: '',
    obiettivoFitness: '',
    // Professional profile (personal trainer)
    bio: utente?.bio || '',
    specializzazioni: [],
    anniEsperienza: '',
    certificazioni: '',
    contattoPubblico: '',
    tariffaIndicativa: '',
    preferenzeVisibilita: {
      palestra: true, peso: false, altezza: false, eta: false,
      obiettivo: true, statistiche: false, record: true
    },
    gamificationAttiva: true,
    accettaToS: false,
    accettaPrivacy: false,
  });

  const aggiorna = (campo, valore) => setForm(p => ({ ...p, [campo]: valore }));

  // Step sequence based on the account type (the personal trainer has a professional path)
  const sequenza = form.tipoAccount === 'PERSONAL_TRAINER' ? SEQ_PT : SEQ_UTENTE;
  const STEP_TOTALI = sequenza.length;
  const chiaveStep = sequenza[step] || 'privacy';

  // Profile photo handling
  const gestisciFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Upload a photo of any size: the crop compresses it automatically
    const reader = new FileReader();
    reader.onload = (ev) => setFotoDaRitagliare(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = ''; // lets the user pick the same file again
  };

  const puoiAvanzare = () => {
    if (chiaveStep === 'privacy') return form.accettaToS && form.accettaPrivacy;
    return true; // All the other steps are optional
  };

  const avanti = () => {
    if (step < STEP_TOTALI - 1) {
      setDirezione(1);
      setStep(s => s + 1);
    }
  };

  const indietro = () => {
    if (step > 0) {
      setDirezione(-1);
      setStep(s => s - 1);
    }
  };

  const completaProfilo = async () => {
    if (!form.accettaToS || !form.accettaPrivacy) {
      setErrore(t('onboarding.erroreConsensi'));
      return;
    }
    setCaricamento(true);
    setErrore('');
    try {
      const risposta = await api.patch('/utenti/completa-profilo', form);
      aggiornaUtente(risposta.dati);
      naviga('/dashboard', { replace: true });
    } catch (err) {
      setErrore(err.message || t('onboarding.erroreSalvataggio'));
    } finally {
      setCaricamento(false);
    }
  };

  const varianti = {
    enter: (d) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  // ═══ STEP RENDERING ═══
  const renderStep = () => {
    switch (chiaveStep) {
      // Account type
      case 'tipo':
        return (
          <div className="flex flex-col gap-4">
            {[
              { val: 'UTENTE', label: t('onboarding.tipo.utente.titolo'), emoji: '🏋️', desc: t('onboarding.tipo.utente.desc') },
              { val: 'PERSONAL_TRAINER', label: t('onboarding.tipo.personalTrainer.titolo'), emoji: '👨‍🏫', desc: t('onboarding.tipo.personalTrainer.desc') },
            ].map(tipo => (
              <button key={tipo.val} onClick={() => aggiorna('tipoAccount', tipo.val)}
                className={`p-5 rounded-2xl border-2 text-left transition-all ${
                  form.tipoAccount === tipo.val
                    ? 'border-[var(--accent)] bg-[var(--accent-dim)] shadow-lg'
                    : 'border-[var(--bordo)] hover:border-[var(--testo-terziario)]'
                }`}>
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{tipo.emoji}</span>
                  <div>
                    <p className="font-bold text-[var(--testo-primario)]">{tipo.label}</p>
                    <p className="text-xs text-[var(--testo-secondario)] mt-0.5">{tipo.desc}</p>
                  </div>
                  {form.tipoAccount === tipo.val && (
                    <Check size={20} className="ml-auto text-[var(--accent)]" />
                  )}
                </div>
              </button>
            ))}
            {form.tipoAccount === 'PERSONAL_TRAINER' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  {t('onboarding.tipo.avvisoPT')}
                </p>
              </motion.div>
            )}
          </div>
        );

      // Profile photo
      case 'foto':
        return (
          <div className="flex flex-col items-center gap-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-32 h-32 rounded-full border-3 border-dashed border-[var(--bordo)] hover:border-[var(--accent)] flex items-center justify-center cursor-pointer transition-colors overflow-hidden group"
            >
              {form.immagineProfilo ? (
                <img src={form.immagineProfilo} alt={t('onboarding.foto.alt')} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors">
                  <Camera size={28} />
                  <span className="text-[10px]">{t('onboarding.foto.carica')}</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={gestisciFoto} />
            <p className="text-xs text-[var(--testo-terziario)] text-center">{t('onboarding.foto.istruzioni')}</p>
            {form.immagineProfilo && (
              <button onClick={() => aggiorna('immagineProfilo', null)}
                className="text-xs text-[var(--pericolo)] hover:underline">{t('onboarding.foto.rimuovi')}</button>
            )}
          </div>
        );

      // Date of birth + Sex
      case 'dati':
        return (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('onboarding.dati.dataNascita')}</label>
              <input type="date" value={form.dataNascita} onChange={e => aggiorna('dataNascita', e.target.value)}
                className="campo-input" max={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-3 text-[var(--testo-secondario)]">{t('onboarding.dati.genere')}</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { val: 'M', label: t('onboarding.dati.maschio'), emoji: '♂️' },
                  { val: 'F', label: t('onboarding.dati.femmina'), emoji: '♀️' },
                  { val: 'Altro', label: t('onboarding.dati.altro'), emoji: '⚧️' },
                ].map(g => (
                  <button key={g.val} onClick={() => aggiorna('genere', g.val)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      form.genere === g.val
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--bordo)] hover:border-[var(--testo-terziario)]'
                    }`}>
                    <span className="text-2xl block mb-1">{g.emoji}</span>
                    <span className="text-xs font-medium">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      // Weight + Height
      case 'misure':
        return (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('onboarding.misure.peso')}</label>
              <div className="relative">
                <input type="number" value={form.pesoKg} onChange={e => aggiorna('pesoKg', e.target.value)}
                  className="campo-input pr-12" placeholder="75" min="30" max="300" step="0.1" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--testo-terziario)]">kg</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('onboarding.misure.altezza')}</label>
              <div className="relative">
                <input type="number" value={form.altezzaCm} onChange={e => aggiorna('altezzaCm', e.target.value)}
                  className="campo-input pr-12" placeholder="175" min="100" max="250" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--testo-terziario)]">cm</span>
              </div>
            </div>
            {form.pesoKg && form.altezzaCm && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="p-4 rounded-xl bg-[var(--accent-dim)] text-center">
                <p className="text-xs text-[var(--testo-secondario)]">{t('onboarding.misure.bmi')}</p>
                <p className="text-2xl font-bold text-[var(--accent)]">
                  {(form.pesoKg / Math.pow(form.altezzaCm / 100, 2)).toFixed(1)}
                </p>
              </motion.div>
            )}
          </div>
        );

      // Fitness goal
      case 'obiettivo':
        return (
          <div className="grid grid-cols-2 gap-3">
            {OBIETTIVI.map(obj => (
              <button key={obj.id} onClick={() => aggiorna('obiettivoFitness', obj.id)}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  form.obiettivoFitness === obj.id
                    ? 'border-[var(--accent)] bg-[var(--accent-dim)] shadow-lg'
                    : 'border-[var(--bordo)] hover:border-[var(--testo-terziario)]'
                }`}>
                <span className="text-2xl block mb-1">{obj.emoji}</span>
                <p className="text-xs font-bold">{t(obj.label)}</p>
                <p className="text-[10px] text-[var(--testo-terziario)] mt-0.5">{t(obj.desc)}</p>
              </button>
            ))}
          </div>
        );

      // Personal trainer profile — Introduction (bio + specializations)
      case 'pro1':
        return (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('onboarding.pro.bio')}</label>
              <textarea value={form.bio} onChange={e => aggiorna('bio', e.target.value.slice(0, 300))}
                className="campo-input min-h-[90px] resize-none" rows="3"
                placeholder={t('onboarding.pro.bioPlaceholder')} />
              <p className="text-[10px] text-[var(--testo-terziario)] mt-1 text-right">{(form.bio || '').length}/300</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-3 text-[var(--testo-secondario)]">{t('onboarding.pro.specializzazioni')}</label>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZZAZIONI_PRESET.map(({ valore: s, chiave }) => {
                  const sel = form.specializzazioni.includes(s);
                  return (
                    <button key={s} type="button"
                      onClick={() => aggiorna('specializzazioni', sel ? form.specializzazioni.filter(x => x !== s) : [...form.specializzazioni, s])}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${sel ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'border-[var(--bordo)] text-[var(--testo-secondario)] hover:border-[var(--accent)]'}`}>
                      {t(chiave)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // Personal trainer profile — Experience, qualifications, contacts
      case 'pro2':
        return (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('onboarding.pro.anniEsperienza')}</label>
                <input type="number" value={form.anniEsperienza} onChange={e => aggiorna('anniEsperienza', e.target.value)}
                  className="campo-input" placeholder="5" min="0" max="60" inputMode="numeric" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('onboarding.pro.tariffa')}</label>
                <input type="text" value={form.tariffaIndicativa} onChange={e => aggiorna('tariffaIndicativa', e.target.value)}
                  className="campo-input" placeholder={t('onboarding.pro.tariffaPlaceholder')} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">{t('onboarding.pro.certificazioni')}</label>
              <textarea value={form.certificazioni} onChange={e => aggiorna('certificazioni', e.target.value.slice(0, 300))}
                className="campo-input min-h-[60px] resize-none" rows="2"
                placeholder={t('onboarding.pro.certificazioniPlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">
                <Testo t="onboarding.pro.contatto" componenti={{ opz: <span className="text-[var(--testo-terziario)]" /> }} />
              </label>
              <input type="text" value={form.contattoPubblico} onChange={e => aggiorna('contattoPubblico', e.target.value)}
                className="campo-input" placeholder={t('onboarding.pro.contattoPlaceholder')} />
            </div>
          </div>
        );

      // Privacy & Consents
      case 'privacy':
        return (
          <div className="flex flex-col gap-5">
            {/* Profile visibility */}
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Shield size={16} className="text-[var(--accent)]" /> {t('onboarding.privacy.visibilita')}
              </h3>
              <p className="text-xs text-[var(--testo-terziario)] mb-3">{t('onboarding.privacy.visibilitaDesc')}</p>
              <div className="flex flex-col gap-2">
                {[
                  { key: 'palestra', label: t('onboarding.privacy.palestra') },
                  { key: 'peso', label: t('onboarding.privacy.peso') },
                  { key: 'altezza', label: t('onboarding.privacy.altezza') },
                  { key: 'eta', label: t('onboarding.privacy.eta') },
                  { key: 'obiettivo', label: t('onboarding.privacy.obiettivo') },
                  { key: 'statistiche', label: t('onboarding.privacy.statistiche') },
                  { key: 'record', label: t('onboarding.privacy.record') },
                ].map(pref => (
                  <label key={pref.key} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--bg-terziario)] transition-colors cursor-pointer">
                    <input type="checkbox"
                      checked={form.preferenzeVisibilita[pref.key]}
                      onChange={e => aggiorna('preferenzeVisibilita', { ...form.preferenzeVisibilita, [pref.key]: e.target.checked })}
                      className="accent-[var(--accent)] w-4 h-4" />
                    <span className="text-sm">{pref.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Gamification */}
            <div className="p-4 rounded-xl border border-[var(--bordo)] bg-[var(--bg-terziario)]">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.gamificationAttiva}
                  onChange={e => aggiorna('gamificationAttiva', e.target.checked)}
                  className="accent-[var(--accent)] w-4 h-4" />
                <div>
                  <p className="text-sm font-bold flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-400" /> {t('onboarding.privacy.gamification')}
                  </p>
                  <p className="text-[10px] text-[var(--testo-terziario)]">{t('onboarding.privacy.gamificationDesc')}</p>
                </div>
              </label>
            </div>

            {/* Required consents */}
            <div className="pt-3 border-t border-[var(--bordo)] flex flex-col gap-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.accettaToS}
                  onChange={e => aggiorna('accettaToS', e.target.checked)}
                  className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
                <span className="text-xs text-[var(--testo-secondario)]">
                  <Testo t="onboarding.privacy.consensoTermini"
                         componenti={{ termini: <a href="/termini" target="_blank" className="text-[var(--accent)] hover:underline" /> }} />
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.accettaPrivacy}
                  onChange={e => aggiorna('accettaPrivacy', e.target.checked)}
                  className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
                <span className="text-xs text-[var(--testo-secondario)]">
                  <Testo t="onboarding.privacy.consensoPrivacy"
                         componenti={{ privacy: <a href="/privacy" target="_blank" className="text-[var(--accent)] hover:underline" /> }} />
                </span>
              </label>
            </div>
          </div>
        );

      default: return null;
    }
  };

  const stepInfo = PASSI[chiaveStep];
  const Icona = stepInfo.icona;

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ 
           background: 'linear-gradient(135deg, #0A0A0F 0%, #12121A 40%, #1A1A2E 100%)',
           paddingTop: 'calc(16px + var(--safe-top))',
           paddingBottom: 'calc(16px + var(--safe-bottom))',
           paddingLeft: 'calc(16px + var(--safe-left))',
           paddingRight: 'calc(16px + var(--safe-right))'
         }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-md overflow-hidden"
      >
        {/* Progress Bar */}
        <div className="px-card-inner pt-5 pb-0">
          <div className="flex items-center justify-between mb-6">
            {Array.from({ length: STEP_TOTALI }).map((_, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < step ? 'bg-[var(--accent)] text-white'
                  : i === step ? 'bg-[var(--accent-dim)] border-2 border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-[var(--bg-terziario)] text-[var(--testo-terziario)]'
                }`}>
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                {i < STEP_TOTALI - 1 && (
                  <div className={`flex-1 h-0.5 mx-1.5 rounded-full transition-colors ${
                    i < step ? 'bg-[var(--accent)]' : 'bg-[var(--bordo)]'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Step header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center">
              <Icona size={20} className="text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{t(stepInfo.titolo)}</h2>
              <p className="text-xs text-[var(--testo-terziario)]">{t(stepInfo.desc)}</p>
            </div>
            <span className="ml-auto text-xs text-[var(--testo-terziario)]">{step + 1}/{STEP_TOTALI}</span>
          </div>
        </div>

        {/* Content */}
        <div className="px-card-inner pb-2 min-h-[280px] relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direzione}>
            <motion.div key={step}
              custom={direzione}
              variants={varianti}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Error */}
        {errore && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mx-6 mb-2 p-3 rounded-xl text-xs bg-[var(--pericolo-dim)] text-[var(--pericolo)] flex items-center gap-2">
            <AlertCircle size={14} /> {errore}
          </motion.div>
        )}

        {/* Actions */}
        <div className="px-card-inner pt-3 pb-6 flex items-center gap-3">
          {step > 0 && (
            <button onClick={indietro}
              className="flex items-center gap-1 text-sm text-[var(--testo-secondario)] hover:text-[var(--testo-primario)] transition-colors">
              <ChevronLeft size={16} /> {t('comune.indietro')}
            </button>
          )}
          <div className="flex-1" />
          {step < STEP_TOTALI - 1 ? (
            <button onClick={avanti}
              className="btn-primario text-sm !py-2.5 !px-6 flex items-center gap-1.5">
              {t('comune.avanti')} <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={completaProfilo}
              disabled={caricamento || !puoiAvanzare()}
              className="btn-primario text-sm !py-2.5 !px-6 flex items-center gap-1.5 disabled:opacity-50">
              {caricamento ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full anima-ruota" /> {t('comune.salvataggio')}</>
              ) : (
                <><Sparkles size={16} /> {t('onboarding.completaProfilo')}</>
              )}
            </button>
          )}
        </div>
      </motion.div>

      {fotoDaRitagliare && (
        <RitaglioFoto
          immagine={fotoDaRitagliare}
          onAnnulla={() => setFotoDaRitagliare(null)}
          onConferma={(base64) => { aggiorna('immagineProfilo', base64); setFotoDaRitagliare(null); }}
        />
      )}
    </div>
  );
}
