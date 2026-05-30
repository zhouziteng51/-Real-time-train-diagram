import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const ignoredFiles = [
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/node_modules/**",
];

const baseRules = {
  "no-console": "off",
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
};

export default [
  {
    ignores: ignoredFiles,
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        App: "readonly",
        Page: "readonly",
        Component: "readonly",
        getApp: "readonly",
        getCurrentPages: "readonly",
        wx: "readonly",
      },
    },
    rules: baseRules,
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...baseRules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
