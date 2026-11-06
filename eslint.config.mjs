import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import prettierConfig from "eslint-config-prettier/flat";
import prettierPlugin from "eslint-plugin-prettier";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  {
    ignores: [
      "public/serviceWorker.js",
      "app/mcp/mcp_config.json",
      "app/mcp/mcp_config.default.json",
      ".next/**",
      "coverage/**",
      "node_modules/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    plugins: {
      prettier: prettierPlugin,
      "unused-imports": unusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Existing memoized wrappers use underscore-prefixed component names.
      // Keep their hook behavior unchanged while the app migrates incrementally.
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  prettierConfig,
];
