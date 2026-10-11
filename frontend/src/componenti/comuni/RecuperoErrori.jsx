// ============================================
// GymMaster — Recovery from render errors
// ============================================
//
// Without this component an error during render unmounts the whole app and
// only the background is left: the "black screen" you can only leave by
// closing the app. Here the error is contained and a way out is offered.
//
// During a workout the progress is already safe (sets on the server, state
// in localStorage), so "Riprova" (retry) resumes from where you were.

import { Component } from 'react';

export default class RecuperoErrori extends Component {
  constructor(props) {
    super(props);
    this.state = { errore: null };
  }

  static getDerivedStateFromError(errore) {
    return { errore };
  }

  componentDidCatch(errore, info) {
    console.error('Errore di render:', errore, info?.componentStack);
  }

  render() {
    const { errore } = this.state;
    if (!errore) return this.props.children;

    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="glass-card p-card-inner max-w-sm w-full text-center flex flex-col gap-4">
          <div className="text-4xl">🛠️</div>
          <div>
            <h2 className="text-lg font-bold">Qualcosa è andato storto</h2>
            <p className="text-sm text-[var(--testo-secondario)] mt-1">
              Questa pagina ha avuto un errore. Quello che avevi già salvato non è perso.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => this.setState({ errore: null })} className="btn-primario w-full">
              Riprova
            </button>
            <button
              type="button"
              // Full reload: starts again from a clean state
              onClick={() => window.location.assign('/dashboard')}
              className="w-full py-2.5 rounded-lg bg-[var(--bg-terziario)] text-[var(--testo-secondario)] font-medium"
            >
              Torna alla home
            </button>
          </div>
          <details className="text-left">
            <summary className="text-[11px] text-[var(--testo-terziario)] cursor-pointer">Dettagli tecnici</summary>
            <p className="text-[11px] text-[var(--testo-terziario)] mt-1 break-words font-mono">{String(errore?.message || errore)}</p>
          </details>
        </div>
      </div>
    );
  }
}
