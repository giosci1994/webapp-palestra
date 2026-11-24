import { describe, it, expect } from 'vitest';
import { formattaRisposta, escapeHtml } from './rispostaAssistente.js';

describe('formattaRisposta', () => {
  it('keeps HTML from the reply as text', () => {
    const html = formattaRisposta('<img src=x onerror=alert(1)>');
    expect(html).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('escapes quotes and ampersands', () => {
    expect(escapeHtml(`a & b "c" 'd'`)).toBe('a &amp; b &quot;c&quot; &#39;d&#39;');
  });

  it('still formats bold, italic and new lines', () => {
    expect(formattaRisposta('**Panca** e *squat*\nriposo')).toBe('<strong>Panca</strong> e <em>squat</em><br/>riposo');
  });

  it('escapes HTML inside bold', () => {
    expect(formattaRisposta('**<script>x</script>**')).toBe('<strong>&lt;script&gt;x&lt;/script&gt;</strong>');
  });

  it('handles an empty reply', () => {
    expect(formattaRisposta(undefined)).toBe('');
  });
});
