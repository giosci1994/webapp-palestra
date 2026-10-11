// ============================================
// GymMaster — <Testo>: a translation with markup
// ============================================
//
// <Testo t="app.nuovaVersione" valori={{ versione }} componenti={{ b: <strong /> }} />
// for texts with bold parts, links and the like (see componenti.js).

import { useLingua } from '../hooks/useLingua.js';
import { conComponenti } from './componenti.js';

export default function Testo({ t: chiave, valori, componenti }) {
  const { t } = useLingua();
  return <>{conComponenti(t(chiave, valori), componenti)}</>;
}
