// All the texts of this language in one file, which the app downloads only
// when it is shown in this language (i18n/index.js, caricaLingua)
export default import.meta.glob('./*.json', { eager: true, import: 'default' });
