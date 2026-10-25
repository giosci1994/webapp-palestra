import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Injected by Vite (vite.config.js, define): the app version
        __APP_VERSION__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // The provider and its hook in the same file (useAuth, useSocket, ...) are
      // the usual context pattern: hot reloading handles them anyway
      'react-refresh/only-export-components': ['error', { allowExportNames: ['useAuth', 'useSocket', 'useAllenamentoInCorso', 'useNotifiche'] }],
    },
  },
])
