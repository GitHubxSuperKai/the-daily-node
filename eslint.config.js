import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Cross-file globals from the concat build: each src/ file references
// identifiers declared in other src/ files. build.js strips imports and
// concatenates everything into one <script> block, so these all resolve at
// runtime — but ESLint sees them as undefined per-file unless declared here.
const concatGlobals = {
  React: 'readonly',
  ReactDOM: 'readonly',
  useState: 'readonly',
  useEffect: 'readonly',
  useRef: 'readonly',
  useCallback: 'readonly',
  useMemo: 'readonly',
  useContext: 'readonly',
  // utils/scale.js
  u: 'readonly',
  applyScale: 'readonly',
  updateScale: 'readonly',
  // theme.js
  ThemeCtx: 'readonly',
  useT: 'readonly',
  LIGHT: 'readonly',
  DARK: 'readonly',
  // utils/svg.js — mutable module-level counter
  _svgUid: 'writable',
  // utils/formatting.js
  classifyTopic: 'readonly',
  timeAgo: 'readonly',
  wmoDesc: 'readonly',
  wmoIcon: 'readonly',
  // utils/alertThresholds.js
  checkPriceThreshold: 'readonly',
  checkFeeThreshold: 'readonly',
  checkBlockTimeThreshold: 'readonly',
  checkMinerOfflineThreshold: 'readonly',
  // hooks/
  useAlerts: 'readonly',
  useHistory: 'readonly',
  useResettableInterval: 'readonly',
  useLayoutSize: 'readonly',
  usePageRefresh: 'readonly',
  useFeedHealth: 'readonly',
  useBTC: 'readonly',
  useChain: 'readonly',
  useBitaxe: 'readonly',
  useRSS: 'readonly',
  useWeather: 'readonly',
  useClock: 'readonly',
  useViewportMode: 'readonly',
  // src/utils/*.js use a dual export pattern: `if (typeof module !== ...)`
  // to remain testable under Node. In-browser the typeof check is undefined.
  module: 'readonly',
};

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
        ...concatGlobals,
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
    // Test files (vitest + jsdom) — concat globals plus Node globals.
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
        ...concatGlobals,
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
    ],
  },
];
