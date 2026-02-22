# CLAUDE.md — SourceKit Charm

## Project Overview
Candidate sourcing and deep research tool. React + Vite + TypeScript + shadcn/ui + Tailwind + Supabase backend.

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build (run after every phase to verify)
- `npm test` — Run vitest
- `npx supabase functions serve` — Local edge function dev

## Architecture
- Frontend: `src/` — React SPA, pages in `src/pages/`, components in `src/components/`
- Backend: `supabase/functions/` — Deno edge functions
- DB: Supabase Postgres with RLS. Types generated in `src/integrations/supabase/types.ts`
- State: @tanstack/react-query for server state, React useState for UI state

## Edge Function Pattern
All edge functions follow this auth pattern:
```typescript
const authHeader = req.headers.get("Authorization");
const token = authHeader.replace("Bearer ", "");
const { data: { user } } = await supabase.auth.getUser(token);
```
CORS headers must include: `authorization, x-client-info, apikey, content-type` and the `x-supabase-client-*` headers.

## Env Vars
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Edge functions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EXA_API_KEY`, `PARALLEL_API_KEY`, `LOVABLE_API_KEY`, `GITHUB_TOKEN`

## Design System (apply to all new UI)
- Background: `#0a0a0f`, Surface: `#111118`, Elevated: `#1a1a24`
- Border: `#2a2a3a`, Primary: `#00e5a0`, Secondary: `#6366f1`
- Text: `#f0f0f5` primary, `#8888a0` secondary, `#555570` muted
- Headings: DM Sans 600-700, Body: Inter 400-500, Mono: JetBrains Mono
- Cards: `bg-[#111118] border border-[#2a2a3a] rounded-xl hover:border-[#00e5a0]/30`
- Dark mode only. Mobile-first. No light mode.

## Constraints
- Do NOT break existing Exa search, enrichment, or pipeline functionality
- TypeScript strict. No `any` in new code.
- All new DB tables need RLS policies.
- Prefer existing deps (shadcn, recharts, lucide, tanstack-query). Minimize new deps.
- Every edge function needs OPTIONS handler for CORS preflight.
- Commit after each working phase. Verify `npm run build` passes before committing.
