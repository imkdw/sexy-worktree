import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import globals from "globals";

const HEX_COLOR_REGEX = String.raw`#[0-9a-fA-F]{3,8}`;

export default tseslint.config(
  { ignores: ["out/**", "node_modules/**", "**/*.config.{js,ts}"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "better-tailwindcss": betterTailwind,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      "better-tailwindcss": {
        entryPoint: "src/renderer/index.css",
      },
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "better-tailwindcss/no-unregistered-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            "^(bg|text|border|p|m|gap|rounded)-\\[(?!var\\().+\\]$",
            "^(w|h)-\\[(?!var\\(--(titlebar|tabbar|toolbar|statusbar|rail)).+\\]$",
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${HEX_COLOR_REGEX}/]`,
          message: "Hardcoded hex colors are forbidden — use a token (var(--color-…)) or cssVar() helper.",
        },
      ],
    },
  },
  {
    files: ["src/{main,preload,shared}/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
