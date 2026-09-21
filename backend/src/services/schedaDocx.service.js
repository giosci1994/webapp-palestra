// ============================================
// GymMaster — Esportazione Schede in .docx
// Documento Word apribile offline (Word, Google Docs, LibreOffice)
// ============================================

import {
  Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType
} from 'docx';

// Palette e misure ricalcate sul modello fornito dall'utente: blu navy per
// intestazioni e titoli di sessione, grigi neutri per il corpo.
const C = {
  titolo: '0F2038',
  sottotitolo: '666666',
  sezione: '2C5282',
  sessione: '1B365D',
  intestazioneSfondo: '1B365D',
  intestazioneTesto: 'FFFFFF',
  cellaForte: '111827',
  cellaNormale: '374151',
  bordo: 'D5D5E0'
};

const FONT = 'Arial';

// Quattro colonne di pari larghezza. Vanno dichiarate sia sulla tabella sia su
// ogni cella, in DXA: con le percentuali Google Docs sbaglia il layout.
const LARGHEZZA_COLONNA = 2484;
const COLONNE = [LARGHEZZA_COLONNA, LARGHEZZA_COLONNA, LARGHEZZA_COLONNA, LARGHEZZA_COLONNA];

const bordoSottile = { style: BorderStyle.SINGLE, size: 1, color: C.bordo };
const BORDI = { top: bordoSottile, bottom: bordoSottile, left: bordoSottile, right: bordoSottile };

function cella(testo, { grassetto = false, sfondo = 'FFFFFF', colore = C.cellaNormale, dimensione = 18 } = {}) {
  return new TableCell({
    borders: BORDI,
    width: { size: LARGHEZZA_COLONNA, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: sfondo },
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: String(testo ?? ''), bold: grassetto, color: colore, size: dimensione, font: FONT })]
    })]
  });
}

/** "4 x 8-10", oppure la descrizione della voce cardio, che non ha serie. */
function serieEReps(voce) {
  const cardio = [];
  if (voce.durataMinuti) cardio.push(`${voce.durataMinuti} min`);
  if (voce.distanzaKm) cardio.push(`${voce.distanzaKm} km`);
  if (cardio.length > 0) return cardio.join(' · ');

  if (voce.serieTarget && voce.repTarget) return `${voce.serieTarget} x ${voce.repTarget}`;
  if (voce.serieTarget) return `${voce.serieTarget} serie`;
  return voce.repTarget || '—';
}

/** Recupero nella notazione del modello: 90" invece di 90s. */
function recupero(voce) {
  return voce.recuperoSecondi ? `${voce.recuperoSecondi}"` : '—';
}

/**
 * Colonna "Note Tecniche".
 *
 * In ordine di precedenza: la nota scritta per questo esercizio in questa
 * scheda, poi la descrizione generica dell'esercizio, infine gruppo muscolare
 * e attrezzatura. Piu' i parametri cardio dove servono.
 */
function note(voce) {
  const parti = [];

  if (voce.riscaldamento) parti.push('Riscaldamento');

  const cardio = [];
  if (voce.velocitaKmh) cardio.push(`${voce.velocitaKmh} km/h`);
  if (voce.inclinazione) cardio.push(`pendenza ${voce.inclinazione}%`);
  if (voce.livelloResistenza) cardio.push(`resistenza ${voce.livelloResistenza}`);
  if (cardio.length > 0) parti.push(cardio.join(', '));

  // La nota scritta per questa scheda ha la precedenza: e' l'indicazione
  // specifica, mentre la descrizione dell'esercizio e' generica.
  const nota = voce.note?.trim();
  const descrizione = voce.esercizio?.descrizione?.trim();
  if (nota) {
    parti.push(nota);
  } else if (descrizione) {
    parti.push(descrizione);
  } else {
    const contesto = [voce.esercizio?.gruppoMuscoloPrimario, voce.esercizio?.attrezzatura?.nome]
      .filter(Boolean).join(' · ');
    if (contesto) parti.push(contesto);
  }

  return parti.join(' — ') || '—';
}

function tabellaEsercizi(esercizi) {
  const intestazioni = ['Esercizio', 'Serie x Reps', 'Recupero', 'Note Tecniche'];

  const righe = [
    new TableRow({
      tableHeader: true,
      children: intestazioni.map(t => cella(t, {
        grassetto: true,
        sfondo: C.intestazioneSfondo,
        colore: C.intestazioneTesto,
        dimensione: 19
      }))
    }),
    ...esercizi.map(voce => new TableRow({
      children: [
        cella(voce.esercizio?.nome, { grassetto: true, colore: C.cellaForte }),
        cella(serieEReps(voce)),
        cella(recupero(voce)),
        cella(note(voce))
      ]
    }))
  ];

  return new Table({ columnWidths: COLONNE, width: { size: 9936, type: WidthType.DXA }, rows: righe });
}

function paragrafoTitolo(testo) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: testo, bold: true, size: 40, color: C.titolo, font: FONT })]
  });
}

function paragrafoSottotitolo(testo) {
  return new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({ text: testo, italics: true, size: 22, color: C.sottotitolo, font: FONT })]
  });
}

function paragrafoSezione(testo) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text: testo, bold: true, size: 25, color: C.sezione, font: FONT })]
  });
}

function paragrafoSessione(testo) {
  return new Paragraph({
    spacing: { before: 360, after: 140 },
    children: [new TextRun({ text: testo, bold: true, size: 30, color: C.sessione, font: FONT })]
  });
}

/**
 * Ricava le linee guida dalla descrizione: se contiene piu' righe o e' divisa
 * da punti e virgola diventa un elenco puntato, altrimenti resta un paragrafo.
 */
function lineeGuida(testo) {
  if (!testo?.trim()) return [];
  const voci = testo.split(/\r?\n|(?<=[.;])\s{2,}/).map(v => v.trim()).filter(Boolean);

  if (voci.length <= 1) {
    return [new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: testo.trim(), size: 20, color: C.cellaNormale, font: FONT })]
    })];
  }

  return voci.map(v => new Paragraph({
    numbering: { reference: 'elenco-guida', level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text: v, size: 20, color: C.cellaNormale, font: FONT })]
  }));
}

/** Righe vuote per segnare i carichi a mano: il documento si usa in palestra. */
function spazioNote() {
  const righe = [paragrafoSezione('Note')];
  for (let i = 0; i < 4; i++) {
    righe.push(new Paragraph({
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: C.bordo, space: 8 } },
      children: [new TextRun({ text: '', size: 20, font: FONT })]
    }));
  }
  return righe;
}

/**
 * Genera il documento di una o piu' schede.
 *
 * Con piu' schede ciascuna diventa una sessione numerata, che e' il modo in cui
 * un programma settimanale viene normalmente scritto: non una scheda ripetuta
 * ogni giorno, ma sedute diverse distribuite sulla settimana.
 *
 * @param {object[]} schede - Schede con `esercizi[].esercizio` inclusi
 * @param {{titolo?: string, sottotitolo?: string}} [opzioni]
 * @returns {Promise<Buffer>}
 */
export async function generaDocxSchede(schede, opzioni = {}) {
  const multipla = schede.length > 1;

  const titolo = opzioni.titolo?.trim()
    || (multipla ? 'Programma di Allenamento' : (schede[0]?.titolo || 'Scheda di Allenamento'));

  const totaleEsercizi = schede.reduce((t, s) => t + (s.esercizi?.length || 0), 0);
  const sottotitolo = opzioni.sottotitolo?.trim() || (multipla
    ? `Programma settimanale su ${schede.length} sedute — ${totaleEsercizi} esercizi complessivi`
    : [schede[0]?.livello && `Livello: ${schede[0].livello}`,
       schede[0]?.creatore?.nome && `Creata da ${schede[0].creatore.nome}`,
       `${totaleEsercizi} eserciz${totaleEsercizi === 1 ? 'io' : 'i'}`].filter(Boolean).join('  ·  '));

  const corpo = [paragrafoTitolo(titolo), paragrafoSottotitolo(sottotitolo)];

  // Le descrizioni delle schede diventano le linee guida in testa al documento.
  // Le sedute di uno stesso programma condividono spesso le stesse indicazioni:
  // ripeterle una volta per scheda renderebbe il documento illeggibile.
  const descrizioni = [...new Set(schede.map(s => s.descrizione?.trim()).filter(Boolean))];
  if (descrizioni.length > 0) {
    corpo.push(paragrafoSezione('Linee Guida'));
    for (const d of descrizioni) corpo.push(...lineeGuida(d));
  }

  schede.forEach((scheda, i) => {
    const esercizi = scheda.esercizi || [];
    corpo.push(paragrafoSessione(multipla ? `Sessione ${i + 1}: ${scheda.titolo}` : 'Esercizi'));

    if (esercizi.length === 0) {
      corpo.push(new Paragraph({
        children: [new TextRun({ text: 'Questa scheda non contiene ancora esercizi.', italics: true, size: 20, color: C.sottotitolo, font: FONT })]
      }));
    } else {
      corpo.push(tabellaEsercizi(esercizi));
    }
  });

  corpo.push(...spazioNote());

  corpo.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    children: [new TextRun({
      text: `Esportata da GymMaster il ${new Date().toLocaleDateString('it-IT')}`,
      size: 16, color: '9999AA', font: FONT
    })]
  }));

  const documento = new Document({
    creator: 'GymMaster',
    title: titolo,
    description: sottotitolo,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering: {
      config: [{
        reference: 'elenco-guida',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 240 } } }
        }]
      }]
    },
    sections: [{ properties: {}, children: corpo }]
  });

  return Packer.toBuffer(documento);
}

/** Nome file sicuro: solo caratteri innocui, cosi' nessun titolo puo' alterare l'header HTTP. */
export function nomeFileDocumento(titolo) {
  const base = (titolo || 'scheda')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // toglie gli accenti
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60) || 'scheda';
  return `${base}.docx`;
}
