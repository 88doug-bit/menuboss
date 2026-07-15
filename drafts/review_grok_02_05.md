# Review: Product PRD Tasks 02–05 (Architecture, Testing, Functional Reqs, NFR/Roadmap)

**Reviewer:** Review agent (`review/grok-02-05-product`)  
**Date:** 2026-07-15  
**Branch:** `review/grok-02-05-product`  
**Scope:** Fidelity of implementer drafts vs briefs; cross-document consistency with Database PRD v0.4 and research findings  

| Task | Brief | Draft | Verdict |
|------|-------|-------|---------|
| **02** Architecture & API (§4, §6, §10) | `grok_02_product_prd_architecture_api.md` | `drafts/grok_out_product_architecture.md` | **Approve with nits** |
| **03** Testing Strategy | `grok_03_testing_strategy_section.md` | `drafts/grok_out_testing_strategy.md` | **Approve with nits** |
| **04** Functional Reqs (§8.1–8.3, §8.7–8.8) | `grok_04_functional_reqs_edge_cases.md` | `drafts/grok_out_functional_reqs.md` | **Approve with nits** |
| **05** NFR + Roadmap + Hygiene | `grok_05_nfr_roadmap_hygiene.md` | `drafts/grok_out_nfr_roadmap.md` | **Approve with nits** |

**Overall for integrator:** **Integrate all four drafts.** No task needs a full re-author. Fix the numbered nits below during merge (especially out-of-scope stale §7 / §9.2 surfaces and the Testing placement note). Cross-check against `drafts/grok_out_database_prd_v0.4.md` and `drafts/research_grok_02_05_findings.md` is complete enough to merge.

---

## Executive summary of verdicts

1. **Task 02 — Approve with nits.** Complete D1–D8 / D12 / D14 rewrite of §4, §6, §10; correct delimiters and integration notes; service-role request paths and NestJS/v1 Edge Functions removed; API shapes match normalized model.
2. **Task 03 — Approve with nits.** Full pyramid (Vitest / local Supabase / Playwright), exact RLS matrix placeholder, CI gates, Phase 1–3 expectations. Fix placement wording vs hygiene map and tighten contract-test language (protein roll-up vs shopping list).
3. **Task 04 — Approve with nits.** All required edge-case ACs present and testable; D3/D5/D6/D7/D8/D12/D14/D17 reflected; shopping scale_factor correct. Minor field-name and leftover-§8.4–8.6 hygiene only.
4. **Task 05 — Approve with nits.** NFR budgets (D16) complete with verification methods; Phase 1 gates include RLS matrix, contract test, §9.3 E2E, budgets; hygiene map is integrator-ready. Minor placement/changelog polish.

---

## Task 02 — Architecture & API

**Verdict: Approve with nits**

### Brief compliance

| Criterion | Status |
|-----------|--------|
| `## INTEGRATION NOTES` + `=== REPLACEMENT: §4 / §6 / §10 API ===` | **Pass** |
| D1 RLS sole authority; caller JWT; no service-role request path | **Pass** |
| D2 tRPC in Next.js; no NestJS; Edge Functions not v1 | **Pass** (§6.9 / §10.6 future-only) |
| D3 shared `portion-calc` package; cached derived totals | **Pass** |
| D4 read-only offline; optimistic UI online-only | **Pass** (§6.2, §6.7, §6.8) |
| D5 `portionRequirements[]` / no `protein_portions` | **Pass** |
| D6 `householdIds[]` / derived shared-ness | **Pass** |
| D7 family-global content note | **Pass** (§4) |
| D8 `startDate`/`endDate` + assignment range | **Pass** (§10.3) |
| D12 unit conversion in shopping wrapper | **Pass** |
| D14 thin wrapper over `generate_shopping_list` SECURITY INVOKER | **Pass** |
| No Testing / NFR / FR authoring | **Pass** (pointers only) |
| DB PRD **v0.4** references | **Pass** |

### Findings (Task 02)

#### T02-1 — “Offline audit jobs” phrasing for service-role scope
- **Severity:** Nit  
- **Location:** `grok_out_product_architecture.md` §10.5 (“Service role is limited to migrations, seed, and offline audit jobs”)  
- **Problem:** “Offline audit jobs” can be misread as offline/PWA-related work. Intent is background/non-request-path jobs.  
- **Recommended fix:** Wording → “migrations, seed, and non-request-path audit jobs” (align with §6.6).

#### T02-2 — Pattern 1 “simple create/update” breadth
- **Severity:** Nit  
- **Location:** §6.5 Pattern 1  
- **Problem:** Allows direct Supabase writes for “simple create/update where RLS is sufficient.” Correct under D1, but meal-plan create with portion + membership orchestration is correctly Pattern 2 only.  
- **Recommended fix:** Integrator optional: one clause that MealPlan create/update with portions/membership remains Pattern 2 (already listed under Pattern 2 — low risk if left as-is).

#### T02-3 — No invented features / no TODO abuse
- **Severity:** Info (positive)  
- **Location:** whole draft  
- **Problem:** None found. No `protein_portions` / NestJS-as-v1 / service-role shared writes / offline write queue.  
- **Recommended fix:** None.

---

## Task 03 — Testing Strategy

**Verdict: Approve with nits**

### Brief compliance

| Criterion | Status |
|-----------|--------|
| `## INTEGRATION NOTES` + unnumbered `## Testing Strategy` | **Pass** |
| Philosophy: too many tests; AC → ≥1 automated test | **Pass** |
| Unit Vitest: portion-calc, unit conversion, Zod, pure UI | **Pass** |
| Integration: tRPC + local Supabase; triggers; `generate_shopping_list`; contract test | **Pass** |
| E2E Playwright: §9.3 ×3 + shopping + dual-context realtime + mobile | **Pass** |
| Exact `<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->` | **Pass** |
| Failure modes: offline stale reads, realtime reconnect, concurrent online edits, soft-delete history | **Pass** |
| CI gates non-skippable matrix + contract test; migration matrix extension | **Pass** |
| Phase 1/2/3 expectations | **Pass** |
| No matrix body invented | **Pass** |

### Findings (Task 03)

#### T03-1 — Placement note conflicts with Task 05 hygiene map
- **Severity:** Minor (integrator process)  
- **Location:** Integration Notes line 3 (“after Functional Requirements and before Non-Functional Requirements”) vs `grok_out_nfr_roadmap.md` Part 3 final order (Testing = **§11 after API §10**)  
- **Problem:** Brief Task 03 said after FR / before NFR; Task 05 hygiene (and research §1/§5) places Testing **after API**. Both can be true only after renumbering if NFR is §12 — but “after FR” implies before §9–§10, which is **wrong** for the agreed final TOC.  
- **Recommended fix:** Integrator follows Task 05 map: **§11 after §10 API**. Update Task 03 integration note on paste to “insert as §11 after API; before NFR §12.”

#### T03-2 — Contract test couples “portion formula” to “shopping/roll-up”
- **Severity:** Minor  
- **Location:** Integration / unit pyramid; “TS ↔ SQL contract test” paragraph  
- **Problem:** Claude-authored contract is: pure TS portion formula ↔ **weekly protein roll-up SQL** (same formula). Shopping list uses `scale_factor = servings / yield_servings`, not the protein oz formula. Draft says “SQL shopping/roll-up implementation (D14)” and “identical numeric outputs,” which can be misread as pinning shopping-list quantities to protein totals.  
- **Recommended fix:** Integrator wording: contract pins **portion-calc TS ↔ SQL weekly protein roll-up**; shopping list has separate integration fixtures for scale/D12/optional (not the same contract).

#### T03-3 — “Portion-scaled quantities” on shopping-list integration target
- **Severity:** Nit  
- **Location:** Integration bullet for `generate_shopping_list`  
- **Problem:** “portion-scaled quantities” echoes pre-review “portion multipliers on ingredients” language. Product truth is servings/yield scaling.  
- **Recommended fix:** “servings/yield-scaled quantities (not protein-line rescale).”

#### T03-4 — Concurrent online edits expectation slightly open-ended
- **Severity:** Nit  
- **Location:** Failure-mode table — concurrent shared-plan edits  
- **Problem:** Says behavior is “defined and tested” without pointing at NFR Reliability (v1 last-write acceptable with clear sync UX).  
- **Recommended fix:** Cross-ref NFR Reliability after Part 1 lands; no need to re-author suite list.

---

## Task 04 — Functional Requirements

**Verdict: Approve with nits**

### Brief compliance

| Criterion | Status |
|-----------|--------|
| Delimiters §8.1, §8.2, §8.3, §8.7, §8.8 only | **Pass** |
| §8.4–§8.6 not included | **Pass** |
| D7 family-global + soft-delete / undelete / ingredient badge / case-insensitive merge ACs | **Pass** |
| D3/D5/D17 portion model + formula + athleteCount ≤ count + zero-count + deactivate + settings-change + &lt;100 ms | **Pass** |
| D6/D8 share + date range + shrink reject + unshare realtime + creating household immovable + view-only non-creator | **Pass** |
| D12/D14 shopping: SQL fn, servings/yield, flour g+cups AC, optional group, soft-delete contribute, empty list, multi-plan RLS | **Pass** |
| §8.8 content search family-global; plans visibility-filtered | **Pass** |
| Edge cases as concrete ACs (D11) | **Pass** |

### Findings (Task 04)

#### T04-1 — Attribution field name `created_by` vs `created_by_user_id`
- **Severity:** Nit  
- **Location:** §8.1 (“stores `created_by` (user) attribution”)  
- **Problem:** Database PRD v0.4 / Claude use `created_by_user_id`. Product-level synonym is fine but integrator should normalize terminology.  
- **Recommended fix:** Prefer `created_by_user_id` in final PRD for schema alignment.

#### T04-2 — §8.4–§8.6 left with possible D7 under-statement (acknowledged)
- **Severity:** Minor (out of task scope; integration risk)  
- **Location:** Unchanged Product PRD §8.4–§8.6; draft Integration Notes already flag  
- **Problem:** Task correctly left combinations/ideas/leftovers alone. Those sections are largely compatible (already family-browse language) but never explicitly state D7 family-global the way §8.1/§8.8 do.  
- **Recommended fix:** Optional one-line D7 note on §8.4/§8.5 during hygiene pass — **not** a Task 04 re-author.

#### T04-3 — Formula and D17 fidelity (positive)
- **Severity:** Info  
- **Location:** §8.2 formula block  
- **Problem:** None. Matches Claude canonical formula; Adult Male PortionCategory base; no FamilySettings adult base field.  
- **Recommended fix:** None.

#### T04-4 — Protein total does not rescale shopping lines (positive)
- **Severity:** Info  
- **Location:** §8.7 + AC  
- **Problem:** None. Explicitly corrects v0.1 “portion multipliers” error; aligns with Claude `SHOPPING_LIST_VIEW`.  
- **Recommended fix:** None — **but** §9.2 still wrong (see Cross-document).

---

## Task 05 — NFR, Roadmap, Hygiene

**Verdict: Approve with nits**

### Brief compliance

| Criterion | Status |
|-----------|--------|
| Part 1 / 2 / 3 delimiters + INTEGRATION NOTES | **Pass** |
| NFR subsections; D16 budget table with verification | **Pass** (all five budgets + conditions) |
| PWA/offline = D4 read-only | **Pass** |
| Security: RLS sole + CI matrix one-liners | **Pass** |
| Phase 1: read-only PWA; normalized portions; SQL shopping; success = matrix + contract + §9.3 E2E + budgets | **Pass** |
| Phase 2: offline edit + conflict-resolution design first | **Pass** |
| Phase 3+: density conversion + protein-driven scaling candidates | **Pass** |
| Dependencies: DB PRD v0.4; RLS matrix gate | **Pass** |
| Orphan NFR bullets deleted from roadmap body | **Pass** (explicit note) |
| Hygiene: renumber map 1–14; risks cleanup; header v0.2; references; terminology sweep | **Pass** |
| No Testing Strategy body authored | **Pass** |

### Findings (Task 05)

#### T05-1 — Changelog cites D17 while brief said “16 decisions”
- **Severity:** Nit  
- **Location:** Part 3 changelog block (D17 PortionCategory base ounces)  
- **Problem:** Brief asked ≤8 lines summarizing **16** decisions; draft correctly includes D17 (from DB/product single-source work). Not a defect — better completeness.  
- **Recommended fix:** Keep D17; optionally title as “design-review decision set (D1–D17).”

#### T05-2 — §3.3 phased summary still needs integrator decision
- **Severity:** Minor  
- **Location:** Cross-ref table + `<!-- TODO(coordinator): whether §3.3 is rewritten… -->`  
- **Problem:** Correct TODO. §3.3 in v0.1 still soft-contradicts D4/D12 Phase 3 candidates if left untouched.  
- **Recommended fix:** Prefer short pointer to §13 rather than a second full roadmap in §3.3.

#### T05-3 — Roadmap draft still numbered 11.x (expected)
- **Severity:** Info  
- **Location:** Part 2 headings  
- **Problem:** None — matches brief (“keep 11.x in draft; map to 13.x”). Integrator must renumber.  
- **Recommended fix:** Follow Part 3 subsection table 11.x → 13.x.

#### T05-4 — Hygiene map completeness (positive)
- **Severity:** Info  
- **Location:** Part 3  
- **Problem:** None material. Covers dual §10, terminology purge, Appendix A, Risks disposition, insertion order. Matches research §5 obligations.  
- **Recommended fix:** Execute checklist in order during merge; do not skip terminology sweep outside rewritten ranges (§3, §7, §9.2).

---

## Cross-document consistency

Sources: `drafts/grok_out_database_prd_v0.4.md`, `drafts/research_grok_02_05_findings.md`, `drafts/claude_authored_sections.md` (referenced via research), and the four task drafts.

### C-1 — Core decision alignment across Tasks 02–05 + DB v0.4
- **Severity:** Info (positive)  
- **Status:** **Consistent**  
- **Details:** All four drafts agree with DB v0.4 on:  
  - D1 JWT + RLS sole authority  
  - D2 tRPC-in-Next, no NestJS, no v1 Edge Functions  
  - D3 shared pure portion-calc  
  - D4 read-only offline Phase 1; offline writes Phase 2 after conflict design  
  - D5/D6 normalized `MealPlanPortionRequirement` / `MealPlanHousehold`  
  - D7 family-global content  
  - D8 date-ranged plans  
  - D12 within-dimension conversion; cross-dimension separate lines  
  - D14 `generate_shopping_list` SECURITY INVOKER + tRPC format  
  - D16 budgets (Tasks 03–05)  
  - D17 Adult Male / PortionCategory base (Task 04/05 + DB)

### C-2 — Testing section placement (Task 03 vs Task 05)
- **Severity:** Minor  
- **See:** T03-1  
- **Resolution owner:** Integrator — **use Task 05 map** (Testing §11 after API).

### C-3 — Contract test semantics (Task 03 vs Claude / Task 05 success criteria)
- **Severity:** Minor  
- **See:** T03-2  
- **Details:** Task 05 success criterion “TS↔SQL portion contract test green” is correct. Task 03 body should not imply shopping-list quantities equal portion oz formula.  
- **Resolution:** Wording fix at integrate time.

### C-4 — Stale surfaces **outside** Tasks 02–05 rewrite ranges
- **Severity:** Major **for final Product PRD v0.2** (not a draft re-author failure)  
- **Locations in `Product_PRD_v0.1.md` (must be fixed by hygiene / integrator, not by re-running 02–05):**  

| Surface | Stale claim | Fix owner |
|---------|-------------|-----------|
| §7 Data Model Reference | v0.3; `protein_portions` on MealPlan | Task 05 Part 3 references + entity list update |
| §9.2 MealPlan Editor | “athlete **toggles**” | Coordinator/integrator UI pass (research flag) |
| §9.2 Shopping List View | “Quantities already adjusted for the **calculated portions**” | Same — contradicts D14 scale_factor |
| §3 / Phase bullets | Soft offline / phasing wording | Hygiene §3.3 TODO |
| Header / Appendix A / closing | v0.1, v0.3 filename, “artifacts folder” | Task 05 Part 3 checklist |

- **Recommended fix:** Do **not** fail Tasks 02–05 for these. **Do** block “Product PRD v0.2 complete” until hygiene map + §9.2 alignment are applied. Research marker:

```html
<!-- TODO(coordinator): §9.2 MealPlan Editor and Shopping List View still describe athlete toggles and portion-multiplier shopping quantities. -->
```

### C-5 — Performance budgets wired end-to-end
- **Severity:** Info (positive)  
- **Status:** **Consistent**  
- Task 04 §8.2 AC &lt;100 ms ↔ Task 05 P3 ↔ Task 03 unit benchmark. Task 05 P1–P5 ↔ Task 03 E2E/dual-context. Phase 1 success cites budgets met.

### C-6 — View-only shared non-creator (Task 04 §8.3) vs Claude RLS
- **Severity:** Info (positive)  
- **Status:** **Consistent** with Claude policy shape (creating household + admin edit; shared members read-only v1). Task 02 does not contradict (RLS sole authority; no service-role share bypass).

### C-7 — Terminology purge readiness
- **Severity:** Minor (post-merge verification)  
- **Status:** Rewritten sections (Tasks 02–05 drafts) are clean of banned phrases as product language (mentions of `protein_portions` / NestJS / Edge Functions appear only as “removed / not v1 / future” — acceptable). Full-document sweep still required after paste into v0.1 body.  
- **Checklist after merge:** zero residual `protein_portions`, `visible_to_households`, stored `is_shared`, NestJS, v1 Edge Functions, background sync outside Phase 2, “handled intelligently”, blanket GIN-on-JSONB, service-role request paths, FamilySettings adult base oz, Database PRD v0.3.

### C-8 — DB PRD placeholders vs Product drafts
- **Severity:** Info (positive)  
- **Status:** Product drafts correctly **name** `MealPlanHousehold`, `MealPlanPortionRequirement`, `Unit`, `generate_shopping_list` without embedding Claude SQL/DDL. Task 03 inserts only `RLS_TEST_MATRIX` placeholder. No dual source of truth for schema.

---

## Numbered findings master list (severity roll-up)

| ID | Severity | Task / Cross | Summary |
|----|----------|--------------|---------|
| T02-1 | Nit | 02 | “Offline audit jobs” → non-request-path audit |
| T02-2 | Nit | 02 | Optional Pattern 1 vs MealPlan Pattern 2 clarity |
| T03-1 | Minor | 03 / Cross | Testing insert after API (§11), not after FR |
| T03-2 | Minor | 03 / Cross | Contract test = portion ↔ protein roll-up, not shopping qty |
| T03-3 | Nit | 03 | “Portion-scaled” shopping → servings/yield language |
| T03-4 | Nit | 03 | Concurrent edit expectation → NFR Reliability |
| T04-1 | Nit | 04 | `created_by` → `created_by_user_id` |
| T04-2 | Minor | 04 / hygiene | Optional D7 one-liners on §8.4–§8.5 |
| T05-1 | Nit | 05 | Changelog D17 vs “16 decisions” — keep D17 |
| T05-2 | Minor | 05 | Resolve §3.3 phasing pointer |
| **C-4** | **Major** | **Integrator** | §7 / §9.2 / header / appendix still stale until hygiene applied |
| C-2, C-3, C-7 | Minor | Integrator | Placement, contract wording, post-merge terminology sweep |

No **Blocker** findings against the four drafts themselves.

---

## Integrator recommendation

### Do now
1. **Merge all four drafts** into Product PRD v0.2 using Task 05 Part 3 insertion order:
   1. Task 02 replacements (§4, §6, §10 API)  
   2. Task 04 replacements (§8.1–8.3, §8.7–8.8)  
   3. Insert Testing Strategy as **§11** (Task 03)  
   4. Insert NFR as **§12** (Task 05 Part 1)  
   5. Replace Roadmap; renumber to **§13** (Part 2)  
   6. Renumber Risks to **§14**; apply open-question cleanup  
   7. Header v0.2 + changelog; references → Database PRD v0.4; Appendix A; closing line  
   8. Terminology sweep + §7 entity list  
2. Apply nits **T02-1, T03-1–T03-3, T04-1** in-line during paste (minutes each).  
3. **Align §9.2** (athlete counts not toggles; shopping quantities = servings/yield) before calling v0.2 done — this is the highest residual product risk (C-4).  
4. Paste coordinator RLS matrix into `<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->` when integrating Testing Strategy.  
5. Keep Database PRD v0.4 + Claude sections as SSOT for DDL/policies/SQL; Product remains product-level.

### Do not
- Re-run full Task 02–05 implementer cycles for the nits above.  
- Invent NestJS / service-role / offline-write / protein_portions “compat” layers during integration.  
- Place Testing Strategy between §8 and §9 (violates hygiene map).

### Sign-off
**Ready for integration with nits.** Overall quality is high and decision fidelity is strong relative to `research_grok_02_05_findings.md` and `grok_out_database_prd_v0.4.md`. Product PRD v0.2 should not be marked complete until **C-4 hygiene surfaces** (especially §9.2 shopping/portion UI copy and §7 v0.4 entity list) are cleaned.

---

## Concise verdict summary (for handoff)

| Task | Verdict |
|------|---------|
| **02 Architecture & API** | **Approve with nits** |
| **03 Testing Strategy** | **Approve with nits** |
| **04 Functional Requirements** | **Approve with nits** |
| **05 NFR / Roadmap / Hygiene** | **Approve with nits** |

**Integrator:** Integrate all four; fix minor wording + out-of-range §7/§9.2 hygiene; no full rewrite required.
