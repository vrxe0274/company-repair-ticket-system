import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  // Generated output + the Deno edge function (linted by Deno, not Node ESLint)
  { ignores: ['dist/', 'dev-dist/', 'node_modules/', 'supabase/'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks':   reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // JSX component usage isn't detected without eslint-plugin-react;
      // ignore capitalized identifiers (components, icon imports) instead.
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^(_|[A-Z])', // _discards + renamed component props (icon: Icon)
      }],
    },
  },

  // Service worker — different global scope
  {
    files: ['src/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },

  // Node build scripts (ESM) — Node globals (process, console), not browser
  {
    files: ['**/*.mjs', 'scripts/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
]
