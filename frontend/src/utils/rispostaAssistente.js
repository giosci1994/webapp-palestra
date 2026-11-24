// ============================================
// GymMaster — The assistant's reply as HTML
// ============================================
//
// The AI reply is text with a little markdown (**bold**, *italic*, new lines).
// It is escaped first, so whatever the model writes (or is tricked into
// writing) stays text: only the tags added here become HTML.

const ENTITA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(testo) {
  return String(testo ?? '').replace(/[&<>"']/g, c => ENTITA[c]);
}

/** Simple markdown of the reply -> safe HTML */
export function formattaRisposta(testo) {
  return escapeHtml(testo)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}
