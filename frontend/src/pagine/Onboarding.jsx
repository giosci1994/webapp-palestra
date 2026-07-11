// ============================================
// GymMaster — Wizard Onboarding (Primo Login)
// 6 step per completamento profilo
// ============================================

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contesti/AuthContesto.jsx';
import { api } from '../config/api.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Dumbbell, Camera, Calendar, Ruler, Target, Shield,
  ChevronRight, ChevronLeft, Check, AlertCircle, Sparkles, Award, Briefcase
} from 'lucide-react';
import RitaglioFoto from '../componenti/comuni/RitaglioFoto.jsx';

// Specializzazioni proposte per i Personal Trainer (selezione a chip)
const SPECIALIZZAZIONI_PRESET = [
  'Ipertrofia/Massa', 'Dimagrimento', 'Forza', 'Funzionale', 'Riabilitazione',
  'Preparazione atletica', 'Posturale', 'Bodybuilding', 'Cross training',
  'Senior/Terza età', 'Pre/Post parto', 'Mobilità'
];

// Definizione degli step (config) e sequenze per tipo account
const PASSI = {
  tipo:      { icona: User, titolo: 'Tipo Account', desc: 'Come vuoi usare GymMaster?' },
  foto:      { icona: Camera, titolo: 'Foto Profilo', desc: 'Aggiungi una foto (opzionale)' },
  dati:      { icona: Calendar, titolo: 'Dati Personali', desc: 'Data di nascita e sesso' },
  misure:    { icona: Ruler, titolo: 'Misure', desc: 'Peso e altezza attuali' },
  obiettivo: { icona: Target, titolo: 'Obiettivo', desc: 'Qual è il tuo obiettivo fitness?' },
  pro1:      { icona: Award, titolo: 'Presentazione', desc: 'Bio e specializzazioni' },
  pro2:      { icona: Briefcase, titolo: 'Esperienza', desc: 'Qualifiche, tariffe e contatti' },
  privacy:   { icona: Shield, titolo: 'Privacy & Consensi', desc: 'Personalizza la tua esperienza' },
};
const SEQ_UTENTE = ['tipo', 'foto', 'dati', 'misure', 'obiettivo', 'privacy'];
const SEQ_PT     = ['tipo', 'foto', 'dati', 'pro1', 'pro2', 'privacy'];

const OBIETTIVI = [
  { id: 'massa', label: 'Massa Muscolare', emoji: '💪', desc: 'Aumentare volume e forza' },
  { id: 'definizione', label: 'Definizione', emoji: '🔥', desc: 'Ridurre grasso, tonificare' },
  { id: 'forza', label: 'Forza', emoji: '🏋️', desc: 'Massimizzare i carichi' },
  { id: 'resistenza', label: 'Resistenza', emoji: '🏃', desc: 'Cardio e endurance' },
  { id: 'salute', label: 'Salute', emoji: '❤️', desc: 'Benessere generale' },
  { id: 'altro', label: 'Altro', emoji: '✨', desc: 'Obiettivo personalizzato' },
];

export default function Onboarding() {
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
    // Profilo professionale (PT)
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

  // Sequenza di step in base al tipo account (il PT ha un percorso professionale)
  const sequenza = form.tipoAccount === 'PERSONAL_TRAINER' ? SEQ_PT : SEQ_UTENTE;
  const STEP_TOTALI = sequenza.length;
  const chiaveStep = sequenza[step] || 'privacy';

  // Gestione foto profilo
  const gestisciFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Carica una foto di qualsiasi dimensione: il ritaglio la comprime automaticamente
    const reader = new FileReader();
    reader.onload = (ev) => setFotoDaRitagliare(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = ''; // consente di riselezionare lo stesso file
  };

  const puoiAvanzare = () => {
    if (chiaveStep === 'privacy') return form.accettaToS && form.accettaPrivacy;
    return true; // Tutti gli altri step sono opzionali
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
      setErrore('Devi accettare i Termini e la Privacy Policy per continuare');
      return;
    }
    setCaricamento(true);
    setErrore('');
    try {
      const risposta = await api.patch('/utenti/completa-profilo', form);
      aggiornaUtente(risposta.dati);
      naviga('/dashboard', { replace: true });
    } catch (err) {
      setErrore(err.message || 'Errore durante il salvataggio');
    } finally {
      setCaricamento(false);
    }
  };

  const varianti = {
    enter: (d) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  // ═══ RENDER DEGLI STEP ═══
  const renderStep = () => {
    switch (chiaveStep) {
      // Tipo Account
      case 'tipo':
        return (
          <div className="flex flex-col gap-4">
            {[
              { val: 'UTENTE', label: 'Utente Privato', emoji: '🏋️', desc: 'Allena, traccia i progressi e raggiungi i tuoi obiettivi' },
              { val: 'PERSONAL_TRAINER', label: 'Personal Trainer', emoji: '👨‍🏫', desc: 'Gestisci clienti, crea schede e appuntamenti' },
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
                  La richiesta di ruolo Personal Trainer verrà inviata all'amministratore per l'approvazione. 
                  Nel frattempo potrai usare l'app come utente.
                </p>
              </motion.div>
            )}
          </div>
        );

      // Foto Profilo
      case 'foto':
        return (
          <div className="flex flex-col items-center gap-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-32 h-32 rounded-full border-3 border-dashed border-[var(--bordo)] hover:border-[var(--accent)] flex items-center justify-center cursor-pointer transition-colors overflow-hidden group"
            >
              {form.immagineProfilo ? (
                <img src={form.immagineProfilo} alt="Profilo" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-[var(--testo-terziario)] group-hover:text-[var(--accent)] transition-colors">
                  <Camera size={28} />
                  <span className="text-[10px]">Carica foto</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={gestisciFoto} />
            <p className="text-xs text-[var(--testo-terziario)] text-center">Carica una foto: potrai ritagliarla. JPG, PNG, WebP</p>
            {form.immagineProfilo && (
              <button onClick={() => aggiorna('immagineProfilo', null)}
                className="text-xs text-[var(--pericolo)] hover:underline">Rimuovi foto</button>
            )}
          </div>
        );

      // Data di nascita + Sesso
      case 'dati':
        return (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Data di Nascita</label>
              <input type="date" value={form.dataNascita} onChange={e => aggiorna('dataNascita', e.target.value)}
                className="campo-input" max={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-3 text-[var(--testo-secondario)]">Sesso</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { val: 'M', label: 'Maschio', emoji: '♂️' },
                  { val: 'F', label: 'Femmina', emoji: '♀️' },
                  { val: 'Altro', label: 'Altro', emoji: '⚧️' },
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

      // Peso + Altezza
      case 'misure':
        return (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Peso (kg)</label>
              <div className="relative">
                <input type="number" value={form.pesoKg} onChange={e => aggiorna('pesoKg', e.target.value)}
                  className="campo-input pr-12" placeholder="75" min="30" max="300" step="0.1" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--testo-terziario)]">kg</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Altezza (cm)</label>
              <div className="relative">
                <input type="number" value={form.altezzaCm} onChange={e => aggiorna('altezzaCm', e.target.value)}
                  className="campo-input pr-12" placeholder="175" min="100" max="250" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--testo-terziario)]">cm</span>
              </div>
            </div>
            {form.pesoKg && form.altezzaCm && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="p-4 rounded-xl bg-[var(--accent-dim)] text-center">
                <p className="text-xs text-[var(--testo-secondario)]">Il tuo BMI</p>
                <p className="text-2xl font-bold text-[var(--accent)]">
                  {(form.pesoKg / Math.pow(form.altezzaCm / 100, 2)).toFixed(1)}
                </p>
              </motion.div>
            )}
          </div>
        );

      // Obiettivo Fitness
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
                <p className="text-xs font-bold">{obj.label}</p>
                <p className="text-[10px] text-[var(--testo-terziario)] mt-0.5">{obj.desc}</p>
              </button>
            ))}
          </div>
        );

      // Profilo PT — Presentazione (bio + specializzazioni)
      case 'pro1':
        return (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Bio professionale</label>
              <textarea value={form.bio} onChange={e => aggiorna('bio', e.target.value.slice(0, 300))}
                className="campo-input min-h-[90px] resize-none" rows="3"
                placeholder="Presentati ai futuri clienti: chi sei, il tuo approccio, i risultati che fai ottenere…" />
              <p className="text-[10px] text-[var(--testo-terziario)] mt-1 text-right">{(form.bio || '').length}/300</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-3 text-[var(--testo-secondario)]">Specializzazioni</label>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZZAZIONI_PRESET.map(s => {
                  const sel = form.specializzazioni.includes(s);
                  return (
                    <button key={s} type="button"
                      onClick={() => aggiorna('specializzazioni', sel ? form.specializzazioni.filter(x => x !== s) : [...form.specializzazioni, s])}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${sel ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'border-[var(--bordo)] text-[var(--testo-secondario)] hover:border-[var(--accent)]'}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // Profilo PT — Esperienza, qualifiche, contatti
      case 'pro2':
        return (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Anni di esperienza</label>
                <input type="number" value={form.anniEsperienza} onChange={e => aggiorna('anniEsperienza', e.target.value)}
                  className="campo-input" placeholder="5" min="0" max="60" inputMode="numeric" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Tariffa indicativa</label>
                <input type="text" value={form.tariffaIndicativa} onChange={e => aggiorna('tariffaIndicativa', e.target.value)}
                  className="campo-input" placeholder="es. 30€/sessione" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Certificazioni / Qualifiche</label>
              <textarea value={form.certificazioni} onChange={e => aggiorna('certificazioni', e.target.value.slice(0, 300))}
                className="campo-input min-h-[60px] resize-none" rows="2"
                placeholder="es. Laurea in Scienze Motorie, ISSA CPT, FIPE…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--testo-secondario)]">Contatto pubblico <span className="text-[var(--testo-terziario)]">(opzionale)</span></label>
              <input type="text" value={form.contattoPubblico} onChange={e => aggiorna('contattoPubblico', e.target.value)}
                className="campo-input" placeholder="email, telefono o sito web" />
            </div>
          </div>
        );

      // Privacy & Consensi
      case 'privacy':
        return (
          <div className="flex flex-col gap-5">
            {/* Visibilità profilo */}
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Shield size={16} className="text-[var(--accent)]" /> Visibilità Profilo
              </h3>
              <p className="text-xs text-[var(--testo-terziario)] mb-3">Scegli quali informazioni rendere visibili agli altri utenti</p>
              <div className="flex flex-col gap-2">
                {[
                  { key: 'palestra', label: 'Palestra' },
                  { key: 'peso', label: 'Peso' },
                  { key: 'altezza', label: 'Altezza' },
                  { key: 'eta', label: 'Età' },
                  { key: 'obiettivo', label: 'Obiettivo Fitness' },
                  { key: 'statistiche', label: 'Statistiche allenamenti' },
                  { key: 'record', label: 'Record personali' },
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
                    <Sparkles size={14} className="text-amber-400" /> Gamification
                  </p>
                  <p className="text-[10px] text-[var(--testo-terziario)]">Punti esperienza, livelli, classifiche e badge</p>
                </div>
              </label>
            </div>

            {/* Consensi obbligatori */}
            <div className="pt-3 border-t border-[var(--bordo)] flex flex-col gap-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.accettaToS}
                  onChange={e => aggiorna('accettaToS', e.target.checked)}
                  className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
                <span className="text-xs text-[var(--testo-secondario)]">
                  Ho letto e accetto i <a href="/termini" target="_blank" className="text-[var(--accent)] hover:underline">Termini e Condizioni</a> *
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.accettaPrivacy}
                  onChange={e => aggiorna('accettaPrivacy', e.target.checked)}
                  className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
                <span className="text-xs text-[var(--testo-secondario)]">
                  Ho letto e accetto l'<a href="/privacy" target="_blank" className="text-[var(--accent)] hover:underline">Informativa sulla Privacy</a> *
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

          {/* Header Step */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center">
              <Icona size={20} className="text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{stepInfo.titolo}</h2>
              <p className="text-xs text-[var(--testo-terziario)]">{stepInfo.desc}</p>
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
              <ChevronLeft size={16} /> Indietro
            </button>
          )}
          <div className="flex-1" />
          {step < STEP_TOTALI - 1 ? (
            <button onClick={avanti}
              className="btn-primario text-sm !py-2.5 !px-6 flex items-center gap-1.5">
              Avanti <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={completaProfilo}
              disabled={caricamento || !puoiAvanzare()}
              className="btn-primario text-sm !py-2.5 !px-6 flex items-center gap-1.5 disabled:opacity-50">
              {caricamento ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full anima-ruota" /> Salvataggio...</>
              ) : (
                <><Sparkles size={16} /> Completa Profilo</>
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
