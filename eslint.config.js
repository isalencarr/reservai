import tseslint from 'typescript-eslint'

/**
 * O ESLint entra só para o que o Biome não enxerga: uso de API obsoleta. Essa
 * checagem precisa dos tipos do projeto, e o Biome não lê JSDoc de biblioteca.
 * Formatação e estilo continuam sendo do Biome.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'data/**', 'src/db/migrations/**', 'public/**'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts', '*.ts'],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
)
