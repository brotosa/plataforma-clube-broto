import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "docs/**",
    ],
  },
  {
    /**
     * O prefixo `_` já era a convenção da casa; o ESLint é que não a honrava.
     *
     * **O problema não era o aviso — era o que ele escondia.** Dez dos onze
     * avisos da suíte eram parâmetros de `useActionState` (`_anterior`,
     * `_dados`) que a assinatura da API exige e o corpo legitimamente não
     * usa. Marcá-los com `_` é a forma consagrada de dizer "não uso de
     * propósito", e ela estava escrita no código desde sempre.
     *
     * Com dez falsos permanentes na saída, `pnpm lint` virou uma parede de
     * ruído que se aprende a passar os olhos — e o **décimo primeiro aviso,
     * que era verdadeiro**, ficou invisível ali dentro por tempo
     * indeterminado. Ele apontava um ajudante de teste cujo nome dizia ler a
     * definição da tela e que não lia nada.
     *
     * É a mesma lição que o CLAUDE.md registra sobre estilo inline invisível
     * às cercas, do outro lado: lá o sinal não era emitido; aqui era emitido
     * e enterrado. As duas terminam no mesmo lugar — defeito que atravessa
     * fases sem ninguém ver.
     *
     * `varsIgnorePattern` e `caughtErrorsIgnorePattern` entram junto pela
     * mesma razão, e não por simetria decorativa: `catch (_)` quando a causa
     * não importa é o mesmo gesto.
     */
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
