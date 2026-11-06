# Repository Guidelines

## Project Structure & Module Organization

This Next.js/React application is deployed on Vercel. Application code, API routes, state, and UI components live under `app/`; static files are in `public/`. Jest tests are in `test/` and use `*.test.ts` or `*.test.tsx`. Build helpers are in `scripts/`, documentation in `docs/`, and staged engineering records in `plan/`. Keep provider behavior near its route or helper in `app/api/`.

## Build, Test, and Development Commands

Use Node.js 26 and Yarn 1.22.19. The supported range is `>=20.19.0 <=26.x`; `.nvmrc` and CI use Node 26.

- `yarn install` installs dependencies and Husky hooks.
- `yarn dev` starts the Next.js development server and watches generated masks.
- `yarn build` generates masks and creates the standalone production build; run it before deployment changes.
- `yarn vercel-build` runs the exact production build configured for Vercel.
- `yarn vercel-build:analyze` creates client, edge, and Node bundle analyzer reports under `.next/analyze/`.
- `yarn start` serves the production build locally.
- `yarn lint` runs Next.js ESLint checks.
- `yarn test` runs Jest in watch mode; `yarn test:ci` runs the non-interactive suite with coverage.

GitHub Actions in `.github/workflows/ci-cd.yml` runs lint, Jest, TypeScript, and `yarn vercel-build` for pull requests and `main` pushes. Successful checks can deploy Vercel preview or production builds.

Use `.env.local` for local API keys and configuration; never commit secrets. Vercel deployment requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` in the GitHub `Production` environment or repository secrets.

## Coding Style & Naming Conventions

Write TypeScript and React using two-space indentation, semicolons, double quotes, trailing commas, and an 80-column target, as defined in `.prettierrc.js`. Use PascalCase for React components and types, camelCase for functions and variables, and descriptive kebab-case filenames where the surrounding module uses them. Run `yarn lint` before submitting changes; the pre-commit hook also runs `lint-staged`.

## Testing Guidelines

Add or update focused Jest tests in `test/` for behavior changes, especially API helpers and model/provider logic. Keep tests deterministic and avoid real network calls. Before submitting, run `yarn lint`, `./node_modules/.bin/tsc --noEmit`, `yarn test:ci`, and `yarn vercel-build`.

## Commit & Pull Request Guidelines

Use concise, imperative commit subjects with the repository's established prefixes, such as `fix:`, `feat:`, `refactor:`, `perf:`, `docs:`, or `test:`; scopes are acceptable (for example, `fix(auth): ...`). Pull requests should select a change type in `.github/PULL_REQUEST_TEMPLATE.md`, describe the user-visible or architectural impact, list relevant tests, and include screenshots for UI changes. Keep each PR focused and mention Vercel configuration or migration steps when applicable.
