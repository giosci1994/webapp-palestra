// ============================================
// GymMaster — Current language in React
// ============================================
//
// const { t, lingua } = useLingua();  →  t('allenamento.termina'), t('...', { count: 3 })
// Every component that shows text reads it from here: when the language
// changes (Profile), the components that use it render again.

import { useCallback, useSyncExternalStore } from 'react';
import { iscriviLingua, linguaCorrente, traduci } from '../i18n/index.js';

export function useLingua() {
  const lingua = useSyncExternalStore(iscriviLingua, linguaCorrente, linguaCorrente);
  const t = useCallback((chiave, variabili) => traduci(chiave, variabili, lingua), [lingua]);
  return { lingua, t };
}
