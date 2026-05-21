# Decision 008: Frontend Testing Strategy

**Date:** May 2026
**Status:** Accepted
**Author:** Joyce Chong

---

## Context

The frontend had no test coverage going into the v2 multi-region pivot. v2 introduces a reducer rewrite (single-yarn → multi-yarn), per-yarn cancellation, and localStorage persistence — the kind of changes where subtle bugs slip past manual QA. We need a test harness before the refactor lands.

Constraint: keep the harness minimal. Only one developer. No CI yet. Goal is "catch regressions in pure logic and component contracts," not "100% coverage."

---

## Tool Choices

| Tool | Role | Why this one |
|---|---|---|
| Vitest | Test runner | Native to Vite — same config, no Babel/Jest dual-tooling. Jest API-compatible, so docs and patterns transfer. |
| React Testing Library | Component rendering and queries | De facto standard for React. Encourages testing behaviour over implementation, which ages better. |
| happy-dom | DOM environment in Node | Lighter and faster than jsdom; sufficient for our DOM needs (no canvas tests, no service workers). |
| @testing-library/jest-dom | Extra DOM matchers | Adds `.toBeInTheDocument()`, `.toHaveValue()`, etc. Without it, asserting against DOM nodes is verbose. |

Jest was rejected: it requires its own config + transform pipeline parallel to Vite's, which is a maintenance tax for no benefit on a Vite project.

---

## Conventions

- **Test files are collocated** with the file they test: `useAppState.test.ts` next to `useAppState.ts`. No `__tests__/` folder. Discoverability and refactor-friendliness over directory tidiness.
- **What we test**:
  - Pure reducers (every action's invariants).
  - Component contracts (renders correctly given props, fires the right callbacks on user actions).
  - Hydration / persistence boundaries (localStorage round-trip with valid, missing, malformed, version-mismatched payloads).
  - Smoke render of `App` to catch import/build regressions cheaply.
- **What we do not test (yet)**:
  - Visual regression. Defer until the design stabilises post-v2.
  - End-to-end browser tests (Playwright). Defer until we have multiple critical user flows.
  - Backend integration. Backend has its own pytest suite; frontend tests mock fetch.

---

## How to Run

```bash
cd chromaknit-frontend
npm run test                # watch mode (re-runs on file changes)
npm run test -- --run       # one-shot, exits after first run (CI-style)
```

Vitest auto-discovers files matching `**/*.{test,spec}.?(c|m)[jt]s?(x)`.

---

## Decision

Use Vitest + React Testing Library + happy-dom + jest-dom. Collocate tests with source. Cover reducers, component contracts, and hydration boundaries. Defer visual and end-to-end testing until the v2 surface is stable.

Revisit this ADR if: we add CI and need parallel test execution tuning, multiple developers join and want a centralised test directory, or the no-canvas assumption breaks (Phase 2's paint mode introduces canvas — flag for review then).
