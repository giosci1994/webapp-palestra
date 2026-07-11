# Descrizione Scheda Espandibile

Documentazione della funzionalità di ottimizzazione del layout e testo collassabile per la descrizione della scheda di allenamento.

## Problema Originario
- La descrizione della scheda era posizionata all'interno dello stesso contenitore flex orizzontale che allineava il titolo e i pulsanti (badge di livello e tasto Modifica).
- Questo costringeva il testo della descrizione in una porzione ristretta dello spazio orizzontale, rendendo difficile la lettura (in particolare sui dispositivi mobili).
- Mancava un controllo per troncamento in presenza di descrizioni molto lunghe.

## Soluzione Implementata
La soluzione si articola in due modifiche principali:

1. **Ristrutturazione del Layout**:
   - La descrizione (`scheda.descrizione`) è stata spostata al di fuori del contenitore flex-row di intestazione.
   - Posizionata direttamente sotto l'intestazione, occupa ora il 100% della larghezza della card (`w-full`), migliorando drasticamente la leggibilità.

2. **Testo Collassabile (Show More / Show Less)**:
   - Viene usato uno stato locale React `descrizioneEspansa` (booleano) per tracciare lo stato di espansione.
   - Se la descrizione supera i **180 caratteri**, viene considerata "lunga" e viene attivata la funzionalità di collasso.
   - Se non è espansa, il testo viene limitato a un massimo di 4 righe mediante la classe CSS Tailwind `line-clamp-4`.
   - Se espansa, il limite viene rimosso (`line-clamp-none`).
   - Un pulsante posizionato sotto il testo mostra una freccia (chevron SVG) che ruota fluidamente di 180 gradi a seconda dello stato (`rotate-180`), offrendo un feedback visivo immediato ed elegante.

## Dettagli Codice (JSX)
```jsx
const [descrizioneEspansa, setDescrizioneEspansa] = useState(false);
const haDescrizioneLunga = scheda.descrizione && scheda.descrizione.length > 180;

// ...
{scheda.descrizione && (
  <div className="mt-2 mb-3">
    <p className={`text-[var(--testo-secondario)] text-sm leading-relaxed transition-all duration-300 ${
      haDescrizioneLunga && !descrizioneEspansa ? 'line-clamp-4' : ''
    }`}>
      {scheda.descrizione}
    </p>
    {haDescrizioneLunga && (
      <button
        onClick={() => setDescrizioneEspansa(!descrizioneEspansa)}
        className="flex items-center gap-1 text-xs text-[var(--accent)] font-semibold mt-2 hover:text-[var(--accent-hover)] transition-colors"
      >
        {descrizioneEspansa ? 'Mostra meno' : 'Mostra tutto'}
        <svg
          className={`w-3.5 h-3.5 transform transition-transform duration-200 ${
            descrizioneEspansa ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    )}
  </div>
)}
```
