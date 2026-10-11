// ============================================
// GymMaster — Translated text with markup
// ============================================
//
// A translation can mark parts of itself with tags, e.g.
// "New version <b>{version}</b> available": conComponenti() turns each tag
// into the element given for it ({ b: <strong /> }), with the tagged text as
// its content. Tags without an element become plain text. The text is never
// parsed as HTML: values (user names, numbers) stay plain text.

import { cloneElement } from 'react';

export function conComponenti(testo, componenti = {}) {
  const parti = [];
  const tag = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let fine = 0;
  let trovato;
  while ((trovato = tag.exec(testo))) {
    if (trovato.index > fine) parti.push(testo.slice(fine, trovato.index));
    const elemento = componenti[trovato[1]];
    parti.push(elemento ? cloneElement(elemento, { key: parti.length }, trovato[2]) : trovato[2]);
    fine = tag.lastIndex;
  }
  if (fine < testo.length) parti.push(testo.slice(fine));
  return parti;
}
