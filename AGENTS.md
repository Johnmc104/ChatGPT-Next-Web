# Repository Guidelines

## Project Structure & Module Organization

This repository is a Next.js/React application. Application code, API routes, state, and UI components live under `app/`; shared static files and browser assets are in `public/`. Jest tests are kept in `test/` and use the `*.test.ts` or `*.test.tsx` naming pattern. The `scripts/` directory contains build and environment helpers, `docs/` contains project documentation and screenshots, and `src-tauri/` contains the Rust/Tauri desktop wrapper. Keep provider-specific API behavior close to its route or helper in `app/api/`, and place reusable client logic in the relevant `app` module.

## Build, Test, and Development Commands

Use Node.js 18.17–22.x and Yarn 1.22.19.

- `yarn install` installs dependencies and Husky hooks.
- `yarn dev` starts the Next.js development server and watches generated masks.
- `yarn build` generates masks and creates the standalone production build; run it before deployment changes.
- `yarn start` serves the production build locally.
- `yarn lint` runs Next.js ESLint checks.
- `yarn test` runs Jest in watch mode; `yarn test:ci` runs the non-interactive suite with coverage.
- `yarn app:dev` and `yarn app:build` develop or package the Tauri desktop application.

Use `.env.local` for local API keys and configuration; never commit secrets.

## Coding Style & Naming Conventions

Write TypeScript and React using two-space indentation, semicolons, double quotes, trailing commas, and an 80-column target, as defined in `.prettierrc.js`. Use PascalCase for React components and types, camelCase for functions and variables, and descriptive kebab-case filenames where the surrounding module uses them. Run `yarn lint` before submitting changes; the pre-commit hook also runs `lint-staged`.

## Testing Guidelines

Add or update focused Jest tests in `test/` for behavior changes, especially API helpers and model/provider logic. Keep tests deterministic and avoid real network calls. Run the affected test file during development, then run `yarn test:ci` for the complete CI-equivalent check and coverage report.

## Commit & Pull Request Guidelines

Use concise, imperative commit subjects with the repository's established prefixes, such as `fix:`, `feat:`, `refactor:`, `perf:`, `docs:`, or `test:`; scopes are acceptable (for example, `fix(auth): ...`). Pull requests should select a change type in `.github/PULL_REQUEST_TEMPLATE.md`, describe the user-visible or architectural impact, list relevant tests, and include screenshots for UI changes. Keep each PR focused and mention configuration or migration steps when applicable.
