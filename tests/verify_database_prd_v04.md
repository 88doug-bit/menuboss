# Database PRD v0.4 Verification Checklist

Automated checks for `drafts/grok_out_database_prd_v0.4.md` against the revision brief:

- Brief: `grok_01_database_prd_v0.4_revision.md`
- Source baseline: `Recipe_Meal_Planning_Database_PRD_v0.3.md`
- Target: `drafts/grok_out_database_prd_v0.4.md`
- Script: `tests/verify_database_prd_v04.ps1`

## How to run

From the repository root (Windows PowerShell):

```powershell
# Verify the real draft (exit 1 on any failure)
powershell -NoProfile -File tests/verify_database_prd_v04.ps1

# Optional: custom path
powershell -NoProfile -File tests/verify_database_prd_v04.ps1 -Path drafts/grok_out_database_prd_v0.4.md

# Self-test script logic with pass/fail fixtures (no draft required)
powershell -NoProfile -File tests/verify_database_prd_v04.ps1 -SelfTest
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | All checks passed (or self-test passed) |
| 1 | One or more checks failed |

---

## Checklist (what the script enforces)

### 1. File presence

| # | Check | Rule |
|---|--------|------|
| F1 | File exists | `drafts/grok_out_database_prd_v0.4.md` must exist |

### 2. Document header / framing

| # | Check | Rule |
|---|--------|------|
| H1 | Integration notes | Document starts with or contains `## INTEGRATION NOTES` |
| H2 | Version | Version **0.4** present |
| H3 | Date | **July 15 2026** (or `2026-07-15`) present |
| H4 | Status | **Revised per design review** present |

### 3. Required placeholders (exact strings)

Coordinator-owned sections must appear as literal HTML comments; Grok must not expand them.

| # | Exact placeholder |
|---|-------------------|
| P1 | `<!-- CLAUDE_SECTION: NEW_TABLE_SCHEMAS -->` |
| P2 | `<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->` |
| P3 | `<!-- CLAUDE_SECTION: RLS_POLICIES -->` |

### 4. Forbidden residual design (must not remain as current design)

These strings/patterns indicate v0.3 decisions that D5–D8, D13, D15, D17 removed.

| # | Forbidden | Decision |
|---|-----------|----------|
| X1 | `protein_portions` (any occurrence - human review) | D5 |
| X2 | `visible_to_households` | D6 |
| X3 | `adult_reference_protein_oz` | D17 |
| X4 | Category `level` / `path` as key fields | D15 |
| X5 | `plan_date` as field or `plan_date` or `start_date` alternative | D8 |
| X6 | Trigger-based full-text alternative (e.g. “tsvector columns or triggers”) | D13 |

### 5. Required concepts (must appear)

| # | Concept | Notes |
|---|---------|--------|
| R1 | `MealPlanHousehold` | D6 junction |
| R2 | `MealPlanPortionRequirement` | D5 normalized portions |
| R3 | `Unit` | D12 conversion table |
| R4 | `start_date` | D8 plan range |
| R5 | `end_date` | D8 plan range |
| R6 | `assignment_date` | D8 assignment in range |
| R7 | generated `tsvector` / `tsvector` | D13 FTS |
| R8 | recursive CTE | D15 hierarchy |
| R9 | `athlete_multiplier` | FamilySettings retains this |
| R10 | `created_by_user_id` | Attribution; ChefIdea proximity check |
| R11 | tRPC | D2 backend |
| R12 | RLS / Row Level Security | D1 |
| R13 | family-global / family global | D7 content visibility |

### 6. Section Section 7 Security and Access Control

| # | Check | Rule |
|---|--------|------|
| S1 | Section 7 heading exists | `## 7. Security and Access Control` |
| S2 | Body is placeholder-only | Contains `<!-- CLAUDE_SECTION: RLS_POLICIES -->` and does **not** retain a full old RLS essay (e.g. multi-bullet “will enforce…” prose) |

### 7. Open items must not re-list resolved decisions

Best-effort scan of Section 8 (Open Items):

| # | Must not appear as open | Resolved by |
|---|-------------------------|-------------|
| O1 | JSONB-vs-normalized portions decision still open | D5 |
| O2 | Visibility storage still open | D6 |
| O3 | RLS pending architecture still open | D1 / design review |

Genuinely open topics that **should** remain (not enforced as required, only documented here):

- Pantry / inventory
- AI integration strategy
- Multi-macro scaling
- Food-safety lookup normalization
- Performance validation at real volumes

---

## Self-test mode

`-SelfTest` writes temporary fixtures:

1. **Compliant fixture** - minimal v0.4-shaped markdown; all checks must **pass**.
2. **Non-compliant fixture** - v0.3 anti-patterns; many checks must **fail** (script fails the self-test if fewer than 5 failures).
3. **Missing file** - path that does not exist; must **fail**.

This validates script logic when the real draft is not yet authored.

---

## Interpreting failures

- **Missing draft:** Run after Implementer produces `drafts/grok_out_database_prd_v0.4.md`. Until then, exit 1 on “File exists” is expected.
- **`protein_portions` hit:** Even historical/changelog mentions fail the strict check; prefer wording like “removed former JSONB portions design” without the identifier, or expect a human waiver after review.
- **Section 7 essay residual:** Replace entire section body with the RLS placeholder only.
- **Open-items residual:** Delete resolved bullets; keep only pantry/AI/multi-macro/food-safety/performance-class items.

---

## Maintenance

When the brief or decision register changes, update both:

1. `tests/verify_database_prd_v04.ps1` (executable rules)
2. This checklist (human-readable matrix)
