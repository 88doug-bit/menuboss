# Product PRD Outputs Verification Checklist (Tasks 02–05)

Automated checks for the four Grok Product PRD draft outputs against coordinator task briefs:

| Task | Draft | Brief (repo root) |
|------|--------|-------------------|
| 02 | `drafts/grok_out_product_architecture.md` | `grok_02_product_prd_architecture_api.md` |
| 03 | `drafts/grok_out_testing_strategy.md` | `grok_03_testing_strategy_section.md` |
| 04 | `drafts/grok_out_functional_reqs.md` | `grok_04_functional_reqs_edge_cases.md` |
| 05 | `drafts/grok_out_nfr_roadmap.md` | `grok_05_nfr_roadmap_hygiene.md` |

- Script: `tests/verify_product_prd_outputs.ps1`
- Checklist: this file

## How to run

From the repository root (Windows PowerShell):

```powershell
# Verify real drafts (exit 1 on any failure)
powershell -NoProfile -File tests/verify_product_prd_outputs.ps1

# Optional: custom drafts directory
powershell -NoProfile -File tests/verify_product_prd_outputs.ps1 -DraftsDir drafts

# Self-test script logic with pass/fail fixtures (no real drafts required)
powershell -NoProfile -File tests/verify_product_prd_outputs.ps1 -SelfTest
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | All checks passed (or self-test passed) |
| 1 | One or more checks failed |

---

## Checklist (what the script enforces)

### 0. File presence

| # | Check | Rule |
|---|--------|------|
| F1 | Architecture draft exists | `drafts/grok_out_product_architecture.md` |
| F2 | Testing draft exists | `drafts/grok_out_testing_strategy.md` |
| F3 | Functional draft exists | `drafts/grok_out_functional_reqs.md` |
| F4 | NFR/roadmap draft exists | `drafts/grok_out_nfr_roadmap.md` |

---

### 1. Product architecture (`grok_out_product_architecture.md`)

| # | Check | Rule |
|---|--------|------|
| A1 | INTEGRATION NOTES | Document contains `## INTEGRATION NOTES` |
| A2 | Three REPLACEMENT delimiters | Exact strings present: |
| | | `=== REPLACEMENT: §4 ===` |
| | | `=== REPLACEMENT: §6 ===` |
| | | `=== REPLACEMENT: §10 API ===` |
| A3 | tRPC | `tRPC` present (primary backend) |
| A4 | NestJS not primary backend | NestJS absent, or only framed as rejected / non-primary (e.g. “no NestJS”); tRPC is the affirmative stack |
| A5 | portionRequirements or householdIds | At least one of `portionRequirements`, `householdIds` |
| A6 | generate_shopping_list | `generate_shopping_list` present |

---

### 2. Testing strategy (`grok_out_testing_strategy.md`)

| # | Check | Rule |
|---|--------|------|
| T1 | Testing Strategy | Heading or body text `Testing Strategy` |
| T2 | Vitest | `Vitest` present |
| T3 | Playwright | `Playwright` present |
| T4 | RLS_TEST_MATRIX placeholder (exact) | Exact string: `<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->` |
| T5 | Contract test | Phrase `contract test` present (case-insensitive) |

---

### 3. Functional requirements (`grok_out_functional_reqs.md`)

| # | Check | Rule |
|---|--------|------|
| R1 | All five §8.x REPLACEMENT delimiters | Exact strings present: |
| | | `=== REPLACEMENT: §8.1 ===` |
| | | `=== REPLACEMENT: §8.2 ===` |
| | | `=== REPLACEMENT: §8.3 ===` |
| | | `=== REPLACEMENT: §8.7 ===` |
| | | `=== REPLACEMENT: §8.8 ===` |
| R2 | athleteCount | `athleteCount` present |
| R3 | start_date or startDate | `start_date` **or** `startDate` present |
| R4 | factor_to_base | `factor_to_base` present |

---

### 4. NFR / roadmap (`grok_out_nfr_roadmap.md`)

| # | Check | Rule |
|---|--------|------|
| N1 | Three PART delimiters | Exact strings present: |
| | | `=== PART 1: NFR SECTION ===` |
| | | `=== PART 2: §11 ROADMAP ===` |
| | | `=== PART 3: HYGIENE MAP ===` |
| N2 | 1.5 s budget | `1.5 s` or `1.5s` (calendar week interactive budget) |
| N3 | 100 ms budget | `100 ms` (portion live-preview budget) |
| N4 | Hygiene map | Phrase `hygiene map` present |
| N5 | Phase 2 conflict | Phase 2 linked to conflict / conflict-resolution (offline writes deferred) |

---

## Out of scope (manual / other suites)

- Full prose quality and AC completeness beyond marker presence
- Cross-draft consistency with Database PRD v0.4 (see `tests/verify_database_prd_v04.ps1`)
- Coordinator-owned RLS matrix body (placeholder only here)
- Product PRD v0.1 integration merge (hygiene map is advisory for integrators)

---

## Related

- Database PRD verifier: `tests/verify_database_prd_v04.ps1` / `tests/verify_database_prd_v04.md`
- Source drafts may be copied from main workspace if missing:  
  `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_*.md`
