import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default {
//   parser: "@typescript-eslint/parser",
//   plugins: ["@typescript-eslint"],
//   extends: [
//     "eslint:recommended",
//     "plugin:@typescript-eslint/recommended"
//   ],
  languageOptions: {
    parser: tsparser
  }
};