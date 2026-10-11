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
        // Iniettata da Vite (vite.config.js, define): la versione dell'app
        __APP_VERSION__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Il provider e il suo hook nello stesso file (useAuth, useSocket) sono
      // lo schema dei contesti: il ricaricamento a caldo li gestisce comunque
      'react-refresh/only-export-components': ['error', { allowExportNames: ['useAuth', 'useSocket'] }],
    },
  },
])
