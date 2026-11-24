import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const a11yRecommended = pluginVueA11y.configs['flat/recommended']
const a11yWorkspaceFiles = ['src/modules/**/*.vue', 'src/components/common/**/*.vue', 'src/layouts/**/*.vue']

/** Catches real mistakes in Vue and TypeScript (unused code, unsafe patterns); formatting is Prettier's job. */
export default tseslint.config(
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**', 'src/components/ui/**', 'e2e/**', 'playwright-report/**', 'test-results/**'] },
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
  // A11y on workspace modules + shared chrome (not marketing/auth/ui primitives).
  ...a11yRecommended.map((config) => ({
    ...config,
    files: a11yWorkspaceFiles,
  })),
  {
    files: a11yWorkspaceFiles,
    rules: {
      // Cards/rows often use @click with nested interactive children; keyboard paths exist via child buttons/links.
      'vuejs-accessibility/click-events-have-key-events': 'off',
      'vuejs-accessibility/interactive-supports-focus': 'off',
      'vuejs-accessibility/no-static-element-interactions': 'off',
      'vuejs-accessibility/mouse-events-have-key-events': 'off',
      'vuejs-accessibility/media-has-caption': 'off',
      // Search/composer autofocus is intentional; keep as warn so new cases stay visible.
      'vuejs-accessibility/no-autofocus': 'warn',
      'vuejs-accessibility/form-control-has-label': 'warn',
      'vuejs-accessibility/label-has-for': 'warn',
      // Core a11y contracts stay hard errors.
      'vuejs-accessibility/alt-text': 'error',
      'vuejs-accessibility/anchor-has-content': 'error',
      'vuejs-accessibility/heading-has-content': 'error',
      'vuejs-accessibility/aria-props': 'error',
      'vuejs-accessibility/aria-role': 'error',
    },
  },
)
