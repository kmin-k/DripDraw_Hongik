import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // 서비스 워커는 window가 아니라 워커 전역에서 돕니다. self·clients가 여기 있습니다.
    // 검사를 끄지 않고 환경만 바꿉니다 — 실제로 도는 코드라 오탈자를 잡아야 합니다.
    files: ["public/sw.js"],
    languageOptions: {
      globals: { self: "readonly", clients: "readonly" },
    },
  },
);
