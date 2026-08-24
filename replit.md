# BrainStudios

BrainStudios is an autonomous AI movie-production workspace that takes directors from a creative brief to screenplay, cast bible, storyboard, budget, shooting schedule, and managed revisions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Provisioned integrations: Replit-managed Clerk and Gemini AI Integrations

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)
- Web: React 19, Vite, Tailwind CSS, TanStack Query, Clerk

## Where things live

- `artifacts/brainstudios/` — cinematic director workspace web artifact.
- `artifacts/api-server/` — Express API and Gemini-backed director-agent runtime.
- `lib/api-spec/openapi.yaml` — source-of-truth API contract; regenerate clients after changes.
- `lib/db/src/schema/studio.ts` — production, agent, screenplay, cast, storyboard, budget, schedule, asset, revision, and dependency models.
- `lib/integrations-gemini-ai/` — shared Gemini client through Replit AI Integrations.

## Architecture decisions

- API is contract-first: frontend hooks and backend validators are generated from the OpenAPI document.
- Production data is modeled as connected, persistent assets rather than a one-shot AI response; unlocked downstream material can be marked outdated after a confirmed director revision.
- Gemini calls use Replit's managed AI Integrations proxy, not a user-supplied API key.
- Clerk uses the Replit-managed tenant for sign-in and sign-up.

## Product

- Create a production from an original idea and follow its live studio activity.
- Review and revise screenplay scenes, character profiles, storyboard frames, production logistics, and requirements.
- Send director notes to the Gemini-powered Director Agent; it identifies the downstream production cascade and requires confirmation before marking assets for revision.
- A seeded demo, “The Lucid Witness,” is available on first launch.

## User preferences

No additional user preferences recorded.

## Gotchas

- After editing the API contract, run code generation before typechecking the app.
- After editing Drizzle tables, run the development database push before starting API tests.
- The generated API Zod barrel may reintroduce a duplicate `ListProductionActivityParams` export after code generation; keep the generated-types barrel export removed.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
