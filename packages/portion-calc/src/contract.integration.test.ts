/**
 * TS ↔ SQL portion-formula CONTRACT TEST (coordinator-authored, CI-blocking).
 *
 * Pins `calculateEffectiveProteinOz` (the canonical implementation) to
 * `weekly_protein_rollup` (the ONLY sanctioned SQL copy of the formula,
 * supabase/migrations/0003_functions.sql) over identical fixtures
 * (fixtures/contract-fixtures.json).
 *
 * Requires a migrated database: set DATABASE_URL (CI runs this against the
 * local Supabase stack). Without DATABASE_URL the suite is SKIPPED — it must
 * never be skipped in CI (the workflow asserts it ran).
 *
 * Scope note: the shopping list's scale_factor (servings / yield_servings) is
 * deliberately NOT part of this contract — it is a different rule with its own
 * pgTAP fixtures (supabase/tests/functions/aggregation.test.sql).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { calculateEffectiveProteinOz } from './index';
import fixtures from '../fixtures/contract-fixtures.json';

const databaseUrl = process.env.DATABASE_URL;

interface Fixture {
  name: string;
  description: string;
  categories: Array<{ id: string; slug: string; baseProteinOz: number; isActive: boolean }>;
  settings: { athleteMultiplier: number };
  requirements: Array<{ portionCategoryId: string; count: number; athleteCount: number }>;
  expectedEffectiveOz: number;
}

describe.skipIf(!databaseUrl)('TS ↔ SQL portion formula contract', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  for (const fixture of fixtures as Fixture[]) {
    it(`agrees on: ${fixture.name}`, async () => {
      // 1. TypeScript side (reference implementation).
      const tsResult = calculateEffectiveProteinOz(
        fixture.requirements,
        fixture.categories,
        fixture.settings,
      );
      expect(tsResult).toBeCloseTo(fixture.expectedEffectiveOz, 4);

      // 2. SQL side, fully isolated in a rolled-back transaction.
      await client.query('BEGIN');
      try {
        // Fixture multiplier must be THE multiplier (single-row config table).
        const upd = await client.query(
          'UPDATE family_settings SET athlete_multiplier = $1',
          [fixture.settings.athleteMultiplier],
        );
        if (upd.rowCount === 0) {
          await client.query(
            'INSERT INTO family_settings (athlete_multiplier) VALUES ($1)',
            [fixture.settings.athleteMultiplier],
          );
        }

        // Map fixture category ids (not UUIDs) to fresh UUID rows.
        const idMap = new Map<string, string>();
        for (const cat of fixture.categories) {
          const uuid = randomUUID();
          idMap.set(cat.id, uuid);
          await client.query(
            `INSERT INTO portion_category (id, name, slug, base_protein_oz, is_active)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuid, cat.slug, `contract-${cat.slug}-${uuid.slice(0, 8)}`, cat.baseProteinOz, cat.isActive],
          );
        }

        const householdId = randomUUID();
        const profileId = randomUUID();
        const planId = randomUUID();
        await client.query(
          `INSERT INTO household (id, name, family_id) VALUES ($1, 'Contract HH', 'contract')`,
          [householdId],
        );
        await client.query(
          `INSERT INTO profile (id, household_id, display_name) VALUES ($1, $2, 'Contract User')`,
          [profileId, householdId],
        );
        // Window far outside seed data so the rollup row set is unambiguous.
        await client.query(
          `INSERT INTO meal_plan (id, title, start_date, end_date, created_by_household_id, created_by_user_id)
           VALUES ($1, 'Contract Plan', '2099-01-01', '2099-01-07', $2, $3)`,
          [planId, householdId, profileId],
        );
        for (const req of fixture.requirements) {
          await client.query(
            `INSERT INTO meal_plan_portion_requirement (meal_plan_id, portion_category_id, count, athlete_count)
             VALUES ($1, $2, $3, $4)`,
            [planId, idMap.get(req.portionCategoryId), req.count, req.athleteCount],
          );
        }

        const { rows } = await client.query(
          `SELECT effective_protein_oz
           FROM weekly_protein_rollup('2099-01-01', '2099-01-07')
           WHERE meal_plan_id = $1`,
          [planId],
        );
        expect(rows).toHaveLength(1);
        const sqlResult = Number(rows[0].effective_protein_oz);

        // 3. The contract: TS and SQL agree with each other AND the fixture.
        expect(sqlResult).toBeCloseTo(tsResult, 4);
        expect(sqlResult).toBeCloseTo(fixture.expectedEffectiveOz, 4);
      } finally {
        await client.query('ROLLBACK');
      }
    });
  }
});
