import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        // src/utils/*.js still use a dual export pattern,
        // `if (typeof module !== 'undefined') module.exports = ...`.
        module: 'readonly',
        // build-time constant injected by esbuild define
        __VERSION__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // JSX uses of imports aren't tracked without eslint-plugin-react,
      // so component imports look "unused". Ignore capitalized identifiers.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^(_|[A-Z])',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-undef': 'error',
      // Intentional codebase pattern: `function Foo(){...} Foo = React.memo(Foo);`
      'no-func-assign': 'off',
    },
  },
  {
    // Test files (vitest + jsdom) — browser plus Node globals.
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^(_|[A-Z])',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-undef': 'error',
    },
  },
  {
    // Node-side scripts (CommonJS).
    files: ['scripts/**/*.cjs', 'build.js', 'server.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // Playwright scripts pass callbacks to page.evaluate that reference
        // browser globals — lint as Node + browser.
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    ignores: [
      'index.html',
      'pitch-deck.html',
      'node_modules/**',
      'src/vendor/**',
      '_site/**',
      'docs/**',
      '.worktrees/**',
      '.claude/**',
    ],
  },
];
