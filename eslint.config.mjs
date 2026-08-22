import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      // Disposable browser test bench — not part of `pnpm check`.
      'apps/playground/**',
    ],
  },
  ...tseslint.configs.recommended,
);
