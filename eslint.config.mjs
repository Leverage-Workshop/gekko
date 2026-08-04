import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'
import vitest from '@vitest/eslint-plugin'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Type-aware rules (no-floating-promises, no-misused-promises, …). They
  // need the TS program, so they are scoped to TS files — plain-JS config
  // files (this one included) are not part of the tsconfig project.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The domain is full of closed string unions (eval status, briefing
      // kind, reasoning effort); a switch that misses a member must fail
      // lint rather than fall through at runtime.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Async functions with no await are pervasive here by design: test
      // fakes and deps objects conform to async interfaces by returning
      // resolved values. The rule is stylistic and fights that idiom.
      '@typescript-eslint/require-await': 'off',
    },
  },
  // The Supabase boundary: the client is deliberately untyped (no generated
  // DB types — reads degrade column-by-column against a possibly-older live
  // schema, see lib/config/fetchConfig.ts), so these thin wrappers
  // destructure `any` responses, cast rows to domain types, and rethrow
  // PostgrestError objects (which the runtime derives from Error). The
  // unsafe-`any` family can't be satisfied here without typing the client;
  // everything outside the boundary stays fully checked.
  {
    files: ['lib/*/deps.ts', 'lib/config/fetchConfig.ts', 'lib/supabase/server.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/only-throw-error': 'off',
    },
  },
  // Test files mock with `any` on purpose (fakes, captured args, jsonb
  // fixtures) and assert on unbound mock references (`expect(fake.method)`).
  // The unsafe-`any` family and unbound-method fight that idiom; the
  // bug-catching rules (floating/misused promises) stay on.
  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  // Test-suite hygiene: a committed .only silently skips the rest of the
  // suite while CI stays green; a bare .skip hides a test with no trail.
  // (describe.skipIf for opt-in integration tests is conditional, not
  // disabled, and is not flagged.)
  {
    files: ['tests/**/*.ts'],
    plugins: { vitest },
    rules: {
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
    },
  },
  // Disable ESLint formatting rules that conflict with Prettier (must come last).
  prettier,
  {
    rules: {
      // The codebase uses `_`-prefixed bindings to intentionally discard
      // values (mostly rest-sibling destructuring that omits fields); the
      // Next.js preset doesn't ignore them, so every one warned.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated trigger.dev build/dev-server output (gitignored; never lint).
    '.trigger/**',
    // Plain-JS service worker (feat-027) — served verbatim, not part of the
    // Next.js module graph; SW globals (self/clients) confuse the app config.
    'public/**',
  ]),
])

export default eslintConfig
