// ============================================
// GymMaster — Entry Point
// ============================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { caricaLingua, linguaCorrente } from './i18n/index.js';
import './index.css';

// The texts of the language in use first (only that one is downloaded), then the app
caricaLingua(linguaCorrente()).finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
