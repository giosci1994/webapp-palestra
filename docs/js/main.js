// GymMaster — landing page
// One language at a time (English / Italian): every translated element carries
// data-en and data-it. The choice is remembered in this browser.
document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const langBtn = document.getElementById('lang-toggle');
  const texts = document.querySelectorAll('[data-en]');
  const metaDesc = document.querySelector('meta[name="description"]');
  const menuBtn = document.querySelector('.menu-btn');
  const menu = document.getElementById('site-menu');
  const KEY = 'gymmaster-lang';

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function remember(lang) {
    try { localStorage.setItem(KEY, lang); } catch (e) { /* private mode: no memory */ }
  }

  function apply(lang) {
    texts.forEach((el) => {
      const value = el.dataset[lang];
      if (value !== undefined) el.innerHTML = value;
    });
    root.lang = lang;
    if (root.dataset[lang + 'Title']) document.title = root.dataset[lang + 'Title'];
    if (metaDesc && metaDesc.dataset[lang]) metaDesc.content = metaDesc.dataset[lang];
    if (langBtn) {
      langBtn.textContent = lang === 'it' ? 'EN' : 'IT';
      langBtn.setAttribute('aria-label', lang === 'it' ? 'Switch to English' : "Passa all'italiano");
      langBtn.title = langBtn.getAttribute('aria-label');
    }
    if (menuBtn && menuBtn.dataset['label' + (lang === 'it' ? 'It' : 'En')]) {
      menuBtn.setAttribute('aria-label', menuBtn.dataset['label' + (lang === 'it' ? 'It' : 'En')]);
    }
  }

  // ?lang=it / ?lang=en wins, then the saved choice, then the browser language.
  const fromUrl = new URLSearchParams(location.search).get('lang');
  let lang = ['en', 'it'].includes(fromUrl) ? fromUrl
    : saved() || ((navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en');
  apply(lang);

  if (langBtn) {
    langBtn.addEventListener('click', () => {
      lang = lang === 'it' ? 'en' : 'it';
      apply(lang);
      remember(lang);
    });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Phone menu: the button shows the links under the bar; Esc, a tapped link or a wider screen closes it.
  // The entrance of the sections is done by Motion, in index.html.
  if (menuBtn && menu) {
    const setOpen = (open) => {
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('open', open);
    };
    menuBtn.addEventListener('click', () => setOpen(menuBtn.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') { setOpen(false); menuBtn.focus(); }
    });
    window.matchMedia('(min-width: 641px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }
});
