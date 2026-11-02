import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Catches real mistakes in Vue and TypeScript (unused code, unsafe patterns); formatting is Prettier's job. */
export default tseslint.config(
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**', 'src/components/ui/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], sourceType: 'module' } },
  },
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // Markup style is left to Prettier; these rules would only fight it.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      // Single-word names are fine for pages and app-specific components.
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      // Markdown is sanitized with DOMPurify before it reaches v-html (see lib/markdown.ts).
      'vue/no-v-html': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // TypeScript already reports unknown names (and knows DOM types such as MediaSessionAction).
      'no-undef': 'off',
    },
  },
)
