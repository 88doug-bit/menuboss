# Brief for Grok — Task 03: Author the new Testing Strategy section (Product PRD v0.2)

**Context:** The MenuBoss Product PRD currently contains **no testing content**. The 2026-07-14 design review made testing a first-class requirement (project owner: "well-tested code is non-negotiable"). Your task: author a complete new **Testing Strategy** section for insertion into Product PRD v0.2 (it will be placed after the Functional Requirements / before Non-Functional Requirements; use the heading `## Testing Strategy` without a number — numbering is applied at integration).

**Attachment required:** `Product_PRD_v0.1.md` (for the user flows in §9.3 and features in §8 that your test plan must cover).

**Output:** a single markdown file the user saves as `drafts/grok_out_testing_strategy.md`. Begin with `## INTEGRATION NOTES`, then the section.

---

## Decisions you are implementing

- **D9** Full testing strategy: **unit = Vitest**, **integration = tRPC procedures against a local Supabase instance**, **E2E = Playwright** over the §9.3 user flows. Per-phase coverage expectations wired into roadmap success criteria.
- **D10** An RLS test matrix is a CI-blocking Phase 1 acceptance criterion. **Do NOT write the matrix itself** — the coordinator authored it. Where it belongs, insert exactly: `<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->`
- **D11** Edge cases are specified as acceptance criteria in the functional requirements (another task writes those ACs); your section defines *how* each class of edge case gets test coverage.
- Relevant architecture decisions your section must reflect: portion calculation is a pure TypeScript function in a shared package (D3 — the flagship unit-test target); shopping-list aggregation is a SQL function (D14 — integration-test target); a **contract test** must pin the TypeScript portion formula and the SQL roll-up implementation to identical outputs over shared fixtures; unit conversion is deterministic with a cross-dimension fallback (D12 — property/table-driven unit tests).

## Required content

1. **Philosophy & coverage stance** (2–3 paragraphs): err toward too many tests; every functional-requirement acceptance criterion maps to at least one automated test; no feature is "done" without tests at the appropriate layer.
2. **Test pyramid & tooling:**
   - *Unit (Vitest):* portion-calc package (all portion categories × athlete counts × settings changes; zero-count; deactivated-category handling), unit-conversion table (within-dimension sums, cross-dimension fallback, unknown units), Zod schemas (valid/invalid/boundary), pure UI logic.
   - *Integration (Vitest + local Supabase via CLI):* every tRPC procedure happy path + failure paths (invalid input, RLS-denied, not-found); DB triggers (assignment-date range, audit); `generate_shopping_list` SQL function with multi-plan/multi-household fixtures; the TS↔SQL contract test.
   - *E2E (Playwright):* the three §9.3 flows (plan a shared meal; capture & use a leftover idea; capture a ChefIdea) plus shopping-list generation and calendar realtime propagation (two browser contexts). Include mobile-viewport runs (PWA is mobile-first).
   - *RLS matrix:* insert the placeholder here.
3. **Failure-mode coverage:** offline cache serving stale reads (v1 is read-only offline), realtime disconnect/reconnect, concurrent edits to a shared plan (online), soft-deleted entities in historical views.
4. **CI gates:** all suites block merge; RLS matrix and contract test explicitly called out as non-skippable; migrations that add tables/policies require matrix extension in the same PR.
5. **Per-phase expectations:** Phase 1 = all of the above for MVP features (success criterion: RLS matrix green, contract test green, §9.3 E2E green). Phase 2 additions (offline-write sync tests, conflict scenarios). Keep Phase 3 to one sentence.

## Constraints
- Match the PRD's voice; product-level, not implementation code (name tools and targets, not test file contents).
- Do not restate the RLS matrix content — placeholder only.
- Where uncertain, insert `<!-- TODO(coordinator): question -->`.
