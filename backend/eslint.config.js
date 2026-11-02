import js from '@eslint/js';
import globals from 'globals';

/** Catches real mistakes (undefined names, unused code, unreachable branches); formatting is left to Prettier. */
export default [
  { ignores: ['node_modules/**', 'uploads/**', 'data/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
