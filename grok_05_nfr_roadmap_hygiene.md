# Brief for Grok — Task 05: NFR section, Roadmap updates, and document hygiene (Product PRD v0.2)

**You are revising a document you originally authored.** Final brief in a set of five implementing the 2026-07-14 design review. Your task has three parts: (1) a new **Non-Functional Requirements** section, (2) revised **§11 Roadmap**, (3) a **hygiene/renumbering map** for the whole document.

**Attachment required:** `Product_PRD_v0.1.md`.

**Output:** a single markdown file the user saves as `drafts/grok_out_nfr_roadmap.md`. Begin with `## INTEGRATION NOTES`, then three parts under delimiters `=== PART 1: NFR SECTION ===`, `=== PART 2: §11 ROADMAP ===`, `=== PART 3: HYGIENE MAP ===`.

---

## Decisions you are implementing

- **D4** v1 offline = read-only cache; offline writes + background sync + a conflict-resolution *design task* move to Phase 2.
- **D9/D10** Testing is a first-class Phase 1 concern: Phase 1 success criteria must include "RLS test matrix green in CI" and "§9.3 E2E flows green".
- **D16** Concrete performance budgets (E2E-testable), replacing all vague "fast" wording:
  - Calendar week view interactive < **1.5 s** on a mid-range phone (cold PWA launch, warm cache)
  - Shopping-list generation < **2 s** for a 7-day multi-household plan
  - Portion live-preview recompute < **100 ms**
  - Search results < **500 ms**
  - Realtime propagation of shared-plan edits < **2 s** end-to-end
- Context decisions the roadmap must reflect: D2 (tRPC in Next.js — no separate backend workstream), D5/D6 (normalized portion + visibility tables), D14 (shopping list = SQL function).

## Part 1 — New Non-Functional Requirements section

The current document has orphaned NFR bullets at the end of §11 (lines 572–577: usability/extensibility, performance, security/privacy, reliability, PWA/offline, maintainability). Promote them into a proper `## Non-Functional Requirements` section (unnumbered heading; numbering applied at integration):
- Reorganize the six bullets into short subsections; make each requirement testable where possible.
- Performance subsection = the D16 budget table, each row naming how it is verified (Playwright/E2E, unit benchmark for the preview).
- PWA/offline subsection = read-only offline per D4.
- Security subsection: reference RLS-as-sole-authority and the CI matrix (one sentence each — details live in DB PRD v0.4 §7 and the Testing Strategy section).

## Part 2 — §11 Roadmap revisions

- **11.2 Phase 1:** remove offline-write/background-sync implications ("PWA foundation" = installable + read-only offline cache); portion features described via normalized model (no `protein_portions` JSONB); shopping list via the SQL aggregation function. Success criteria: add "RLS test matrix green in CI", "TS↔SQL portion contract test green", "§9.3 E2E flows green", "performance budgets met".
- **11.3 Phase 2:** add "Offline editing + background sync, preceded by an explicit conflict-resolution design (documented decision: merge strategy, user-visible conflict UX)". Keep existing items.
- **11.4 Phase 3+:** add "density-based cross-dimension unit conversion" and "protein-driven automatic recipe scaling (requires tagging protein ingredients)" as named candidates. Keep existing items.
- **11.5 Dependencies:** update — the schema dependency now cites Database PRD **v0.4**; add that the RLS matrix is a Phase 1 gate, not an afterthought.
- Replace vague speed adjectives ("feels fast", line 539) with references to the budget table.
- **Delete the orphaned NFR bullets from the end of §11** (they moved to Part 1).

## Part 3 — Hygiene map (instructions for the integrator, not prose)

Produce a precise checklist the integrator applies:
1. **Renumbering:** the document has two "Section 10"s (§10 API & Backend Contracts at line ~422 and §10 Risks/Open Questions at line ~579). Proposed final order: 1–7 unchanged, 8 Functional Requirements, 9 UI/UX, 10 API & Backend Contracts, 11 Testing Strategy (new), 12 Non-Functional Requirements (new), 13 Roadmap & Phasing, 14 Risks/Open Questions & Next Steps. List every internal cross-reference that must change as `old → new`.
2. **Risks/Open Questions cleanup:** remove now-resolved open questions (frontend/backend/Edge Function split → decided D2; detailed RLS design → DB PRD v0.4 §7; shopping-list spec → decided D12/D14). Keep genuinely open ones (nutrition roll-up prioritization, food-safety-note UX patterns, AI timing). Update the over-engineering risk to note the review pared v1 scope (offline writes deferred, normalized model).
3. **Header/version:** bump to v0.2, date July 15 2026, add a changelog block summarizing the 16 decisions in ≤8 lines; author line becomes "Grok + Claude (design review revisions)".
4. **References:** all "Database PRD v0.3" mentions → v0.4 with the correct filename `Recipe_Meal_Planning_Database_PRD_v0.4.md`; Appendix A "artifacts folder" → repo root; remove the trailing "End of Product PRD v0.1 (Sections Started)" line and its invitation paragraph, replace with a v0.2 closing line.
5. **Terminology sweep list:** every phrase the integrator must verify is GONE from the final doc: `protein_portions`, `visible_to_households`, `is_shared` (as stored field), `NestJS`, `Edge Functions` (outside future-work notes), "background sync" (outside Phase 2), "handled intelligently", "GIN indexes on all JSONB".

## Constraints
- Match the document's voice. Parts 1–2 are finished prose; Part 3 is a checklist.
- Do not write the Testing Strategy section (another task owns it) — only its placement in the numbering map.
- Where uncertain, insert `<!-- TODO(coordinator): question -->`.
