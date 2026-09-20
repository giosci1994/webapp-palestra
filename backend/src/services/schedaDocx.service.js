// ============================================
// GymMaster — Esportazione Scheda in .docx
// Documento Word apribile offline (Word, Google Docs, LibreOffice)
// ============================================

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType
} from 'docx';

const GRIGIO_INTESTAZIONE = 'EDEDF2';
const GRIGIO_RIGA = 'F8F8FB';

// Il documento è pensato per essere stampato o letto su carta e in Google Docs:
// niente colori di sfondo scuri, niente dipendenze da font particolari.
const bordoSottile = { style: BorderStyle.SINGLE, size: 1, color: 'D5D5E0' };
const BORDI = { top: bordoSottile, bottom: bordoSottile, left: bordoSottile, right: bordoSottile };

function cella(testo, { grassetto = false, sfondo = null, larghezza = null } = {}) {
  return new TableCell({
    borders: BORDI,
    ...(sfondo ? { shading: { type: ShadingType.CLEAR, fill: sfondo } } : {}),
    ...(larghezza ? { width: { size: larghezza, type: WidthType.PERCENTAGE } } : {}),
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      children: [new TextRun({ text: String(testo ?? '—'), bold: grassetto, size: 19 })]
    })]
  });
}

/**
 * Descrive un esercizio in una riga leggibile.
 * Le voci cardio non hanno serie/ripetizioni ma durata, velocità e pendenza:
 * vanno rese in modo diverso, altrimenti la riga risulterebbe vuota.
 */
function dettagliEsercizio(voce) {
  const parti = [];
  if (voce.durataMinuti) parti.push(`${voce.durataMinuti} min`);
  if (voce.velocitaKmh) parti.push(`${voce.velocitaKmh} km/h`);
  if (voce.inclinazione) parti.push(`pendenza ${voce.inclinazione}%`);
  if (voce.livelloResistenza) parti.push(`resistenza ${voce.livelloResistenza}`);
  if (voce.distanzaKm) parti.push(`${voce.distanzaKm} km`);
  return parti.join(' · ');
}

function righeTabella(esercizi) {
  const intestazione = new TableRow({
    tableHeader: true,
    children: [
      cella('#', { grassetto: true, sfondo: GRIGIO_INTESTAZIONE, larghezza: 5 }),
      cella('Esercizio', { grassetto: true, sfondo: GRIGIO_INTESTAZIONE, larghezza: 34 }),
      cella('Gruppo', { grassetto: true, sfondo: GRIGIO_INTESTAZIONE, larghezza: 16 }),
      cella('Serie', { grassetto: true, sfondo: GRIGIO_INTESTAZIONE, larghezza: 8 }),
      cella('Ripetizioni', { grassetto: true, sfondo: GRIGIO_INTESTAZIONE, larghezza: 13 }),
      cella('Recupero', { grassetto: true, sfondo: GRIGIO_INTESTAZIONE, larghezza: 11 }),
      cella('Note', { grassetto: true, sfondo: GRIGIO_INTESTAZIONE, larghezza: 13 })
    ]
  });

  const righe = esercizi.map((voce, i) => {
    const cardio = dettagliEsercizio(voce);
    const sfondo = i % 2 === 1 ? GRIGIO_RIGA : null;
    return new TableRow({
      children: [
        cella(i + 1, { sfondo }),
        cella(voce.esercizio?.nome, { grassetto: true, sfondo }),
        cella(voce.esercizio?.gruppoMuscoloPrimario, { sfondo }),
        cella(voce.serieTarget ?? '—', { sfondo }),
        cella(voce.repTarget ?? (cardio ? '—' : ''), { sfondo }),
        cella(voce.recuperoSecondi ? `${voce.recuperoSecondi}s` : '—', { sfondo }),
        cella(cardio || (voce.riscaldamento ? 'Riscaldamento' : '—'), { sfondo })
      ]
    });
  });

  return [intestazione, ...righe];
}

function sezione(titolo, esercizi) {
  if (esercizi.length === 0) return [];
  return [
    new Paragraph({
      spacing: { before: 320, after: 140 },
      children: [new TextRun({ text: titolo, bold: true, size: 24 })]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: righeTabella(esercizi)
    })
  ];
}

/**
 * Genera il .docx di una scheda e lo restituisce come Buffer.
 * @param {object} scheda - Scheda con `esercizi[].esercizio` già inclusi
 */
export async function generaDocxScheda(scheda) {
  const esercizi = scheda.esercizi || [];
  const riscaldamento = esercizi.filter(e => e.riscaldamento);
  const principali = esercizi.filter(e => !e.riscaldamento);

  const sottotitolo = [
    scheda.livello ? `Livello: ${scheda.livello}` : null,
    scheda.creatore?.nome ? `Creata da ${scheda.creatore.nome}` : null,
    `${esercizi.length} eserciz${esercizi.length === 1 ? 'io' : 'i'}`
  ].filter(Boolean).join('  ·  ');

  const corpo = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 80 },
      children: [new TextRun({ text: scheda.titolo || 'Scheda di allenamento', bold: true, size: 36 })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: sottotitolo, size: 19, color: '666677' })]
    })
  ];

  if (scheda.descrizione) {
    corpo.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: scheda.descrizione, size: 21 })]
    }));
  }

  if (esercizi.length === 0) {
    corpo.push(new Paragraph({
      children: [new TextRun({ text: 'Questa scheda non contiene ancora esercizi.', italics: true, size: 21 })]
    }));
  } else {
    corpo.push(...sezione('Riscaldamento', riscaldamento));
    corpo.push(...sezione(riscaldamento.length > 0 ? 'Allenamento' : 'Esercizi', principali));
  }

  // Spazio per gli appunti a mano: il documento nasce per essere usato in
  // palestra senza connessione, dove si segnano i carichi effettivi.
  corpo.push(new Paragraph({
    spacing: { before: 400, after: 100 },
    children: [new TextRun({ text: 'Note', bold: true, size: 24 })]
  }));
  for (let i = 0; i < 4; i++) {
    corpo.push(new Paragraph({
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D5D5E0', space: 6 } },
      children: [new TextRun({ text: '', size: 21 })]
    }));
  }

  corpo.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    children: [new TextRun({
      text: `Esportata da GymMaster il ${new Date().toLocaleDateString('it-IT')}`,
      size: 16,
      color: '9999AA'
    })]
  }));

  const documento = new Document({
    creator: 'GymMaster',
    title: scheda.titolo || 'Scheda di allenamento',
    description: scheda.descrizione || 'Scheda di allenamento esportata da GymMaster',
    sections: [{ properties: {}, children: corpo }]
  });

  return Packer.toBuffer(documento);
}

/** Nome file sicuro: solo caratteri innocui, così nessun titolo può alterare l'header HTTP. */
export function nomeFileScheda(scheda) {
  const base = (scheda.titolo || 'scheda')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // toglie gli accenti
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60) || 'scheda';
  return `${base}.docx`;
}
