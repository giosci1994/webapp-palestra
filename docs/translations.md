# Translations

GymMaster speaks English and Italian. English is the base language: anything without a translation falls back to it. More languages can be added without touching the screens.

## How the app picks the language

1. The language chosen in **Profile → Language**, saved on the account (`Utente.lingua`) and on the phone.
2. Otherwise the phone's language, when the app has it (`it-IT`, `it-CH` → Italian).
3. Otherwise English.

Dates and numbers follow the language, in the phone's own format when it matches (an `en-US` phone gets US dates).

## Where the texts are

```text
frontend/src/i18n/
├── index.js            The engine: picking the language, t(), plurals, fallback
├── Testo.jsx           <Testo> for texts with bold parts or links
└── testi/
    ├── en/<namespace>.json   English, the source of truth
    └── it/<namespace>.json   Italian, exactly the same keys
```

One namespace per source file, named after it: `WorkoutLive.jsx` reads `testi/en/workoutLive.json`. Shared words live in `comune.json`; muscle groups and equipment, stored in Italian in the database, are translated in `gruppi.json` and `attrezzi.json`.

## Writing texts in a component

```jsx
import { useLingua } from '../hooks/useLingua.js';

const { t } = useLingua();
t('workoutLive.serieCompletata')                  // plain text
t('dashboard.saluto', { nome: utente.nome })      // "Hi {nome}"
t('comune.serie', { count: 3 })                   // serie_one / serie_other
<Testo t="app.nuovaVersione" valori={{ versione }} componenti={{ b: <strong /> }} />
```

- One key per sentence, with placeholders for the variable parts: word order changes between languages.
- Plurals: keys ending in `_one` and `_other` (and the other categories of `Intl.PluralRules` for languages that need them), with a numeric `count`.
- Labels in module-level constants store the key and are translated when rendered.
- Dates and numbers: the helpers in `utils/formattatori.js`, or `localeCorrente()`.
- Data from the server (plan titles, exercise descriptions, messages) is not translated in the app. Exercise names go through `nomeEsercizio()`, muscle groups through `nomeGruppo()`.

## Checks

`frontend/src/i18n/testi.test.js` fails when:
- a language lacks a file or a key that English has, or has one English lacks;
- a translation changes the placeholders (`{nome}`) or the tags (`<b>`);
- a text is empty;
- the code asks for a key that does not exist.

## Adding a language

1. Copy `frontend/src/i18n/testi/en/` to a folder named after the language code, for example `testi/es/`, and translate the values. Keep the keys, the `{placeholders}` and the `<tags>`.
2. In `frontend/src/i18n/index.js`, add the code to `LINGUE`, its own name to `NOMI_LINGUE` (`es: 'Español'`) and its default locale to `LOCALE_PREDEFINITA` (`es: 'es-ES'`). The folder is loaded on its own.
3. In `backend/src/utils/lingue.js`, add the code to `LINGUE`, so the language can be saved on the account.
4. Run `cd frontend && npm test`: the checks above tell you what is missing.

Plural forms follow the language's rules: Polish or Arabic need `_few` or `_many` keys too, which `Intl.PluralRules` asks for.
