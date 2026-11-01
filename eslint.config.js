import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  { files: ['server/**/*.js', 'server/**/*.mjs', 'eslint.config.js', 'web/vite.config.js', 'web/test/**/*.js', 'web/scripts/**/*.js'], languageOptions: { globals: globals.node } },
  {
    files: ['web/src/**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: 'detect' } },
    rules: { 'react/jsx-uses-vars': 'error', 'react/jsx-uses-react': 'off' },
  },
];
