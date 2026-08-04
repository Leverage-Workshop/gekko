import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
