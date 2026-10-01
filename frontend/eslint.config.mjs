// ESLint del frontend (Next.js 16 ya no trae `next lint`: se usa la CLI de ESLint).
// Reglas de Next.js, React, React Hooks, accesibilidad (jsx-a11y) y TypeScript.
// En CI corre con --max-warnings 0: una advertencia nueva también detiene el cambio.
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Variables a propósito sin usar: prefijo _ (p. ej. para quitar una clave con ...rest).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Aviso del React Compiler, que este proyecto no usa (react-hook-form `watch` es intencional).
      'react-hooks/incompatible-library': 'off',
    },
  },
  {
    // Archivos de configuración CommonJS (Tailwind, PostCSS, Next).
    files: ['*.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**']),
]);
