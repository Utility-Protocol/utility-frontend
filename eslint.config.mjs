import nextPlugin from "@next/eslint-plugin-next";
import tsEslint from "typescript-eslint";

export default [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "dist/**", "test-results/**", "playwright-report/**"],
  },
  ...tsEslint.configs.recommended,
  {
    plugins: { 
      "@next/next": nextPlugin,
      "react-hooks": (await import("eslint-plugin-react-hooks")).default
    },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
