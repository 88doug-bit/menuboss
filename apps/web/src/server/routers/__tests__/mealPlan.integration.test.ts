/**
 * meal_plan_create_or_update + display-unit integration tests.
 *
 * Env-guarded exactly like packages/portion-calc contract.integration.test.ts:
 * `describe.skipIf(!process.env.DATABASE_URL)`, pg client, per-test BEGIN/ROLLBACK.
 *
 * Requires a migrated DB (0001–0004 + seed). Without DATABASE_URL the suite is SKIPPED.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDisplayQuantity, type UnitRow } from "../mealPlanMapper";

const databaseUrl = process.env.DATABASE_URL;

const MEMBER_A = "00000000-0000-4000-8000-0000000000a1";
const HOUSEHOLD_A = "00000000-0000-4000-8000-0000000000a0";
const HOUSEHOLD_B = "00000000-0000-4000-8000-0000000000b0";
const ADULT_MALE = "00000000-0000-4000-8000-000000000207";
const ADULT_FEMALE = "00000000-0000-4000-8000-000000000206";

const MASS_UNITS: UnitRow[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "gram",
    abbreviation: "g",
    dimension: "mass",
    factor_to_base: 1,
    is_active: true,
    sort_order: 10,
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    name: "ounce",
    abbreviation: "oz",
    dimension: "mass",
    factor_to_base: 28.3495,
    is_active: true,
    sort_order: 30,
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    name: "pound",
    abbreviation: "lb",
    dimension: "mass",
    factor_to_base: 453.592,
    is_active: true,
    sort_order: 40,
  },
];

/** Pure display-unit formatting — always runs (no DB). */
describe("shopping list display units", () => {
  it('formats 680 g as 1.5 lb (largest unit ≥ 1)', () => {
    const result = formatDisplayQuantity(680, "mass", MASS_UNITS);
    expect(result.displayUnitAbbreviation).toBe("lb");
    expect(result.displayQuantity).toBeCloseTo(1.5, 5);
  });
});

describe.skipIf(!databaseUrl)("mealPlan RPC integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;

  beforeAll(async () => {
    const { Client } = await import("pg");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function asMemberA() {
    await client.query(
      `SELECT set_config(
         'request.jwt.claims',
         $1,
         true
       )`,
      [`{"sub":"${MEMBER_A}","role":"authenticated"}`],
    );
  }

  async function ensureFixtures(recipeId: string) {
    await client.query(
      `INSERT INTO household (id, name, family_id)
       VALUES ($1, 'Household A', 'menuboss-family'),
              ($2, 'Household B', 'menuboss-family')
       ON CONFLICT (id) DO NOTHING`,
      [HOUSEHOLD_A, HOUSEHOLD_B],
    );
    await client.query(
      `INSERT INTO profile (id, household_id, display_name, role)
       VALUES ($1, $2, 'Member A', 'member')
       ON CONFLICT (id) DO NOTHING`,
      [MEMBER_A, HOUSEHOLD_A],
    );
    await client.query(
      `INSERT INTO portion_category (id, name, slug, base_protein_oz, sort_order)
       VALUES
         ($1, 'Adult Male', 'adult-male', 6.0, 70),
         ($2, 'Adult Female', 'adult-female', 5.0, 60)
       ON CONFLICT (slug) DO NOTHING`,
      [ADULT_MALE, ADULT_FEMALE],
    );
    await client.query(
      `INSERT INTO recipe (id, title, yield_servings, created_by_user_id)
       VALUES ($1, 'Integration Recipe', 4, $2)
       ON CONFLICT (id) DO NOTHING`,
      [recipeId, MEMBER_A],
    );
  }

  it("upsert creates meal_plan + household + portion + assignment rows", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      const assignmentId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      const { rows } = await client.query(
        `SELECT meal_plan_create_or_update($1::jsonb) AS id`,
        [
          JSON.stringify({
            title: "Integration Create",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A, HOUSEHOLD_B],
            portionRequirements: [
              {
                portionCategoryId: ADULT_MALE,
                count: 2,
                athleteCount: 1,
              },
            ],
            assignments: [
              {
                id: assignmentId,
                recipeId,
                assignmentDate: "2099-06-02",
                mealSlot: "dinner",
                servings: 6,
              },
            ],
          }),
        ],
      );
      const planId = rows[0].id as string;
      expect(planId).toBeTruthy();

      const plan = await client.query(
        `SELECT title, created_by_household_id, created_by_user_id
         FROM meal_plan WHERE id = $1`,
        [planId],
      );
      expect(plan.rows[0].title).toBe("Integration Create");
      expect(plan.rows[0].created_by_household_id).toBe(HOUSEHOLD_A);
      expect(plan.rows[0].created_by_user_id).toBe(MEMBER_A);

      const mph = await client.query(
        `SELECT household_id FROM meal_plan_household
         WHERE meal_plan_id = $1 ORDER BY household_id`,
        [planId],
      );
      expect(mph.rows.map((r: { household_id: string }) => r.household_id)).toEqual(
        [HOUSEHOLD_A, HOUSEHOLD_B].sort(),
      );

      const pr = await client.query(
        `SELECT count, athlete_count FROM meal_plan_portion_requirement
         WHERE meal_plan_id = $1`,
        [planId],
      );
      expect(pr.rows).toHaveLength(1);
      expect(Number(pr.rows[0].count)).toBe(2);
      expect(Number(pr.rows[0].athlete_count)).toBe(1);

      const asg = await client.query(
        `SELECT id, meal_slot, servings FROM meal_plan_assignment
         WHERE meal_plan_id = $1`,
        [planId],
      );
      expect(asg.rows).toHaveLength(1);
      expect(asg.rows[0].id).toBe(assignmentId);
      expect(asg.rows[0].meal_slot).toBe("dinner");
      expect(Number(asg.rows[0].servings)).toBe(6);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("reconciliation deletes removed assignments", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      const keepId = randomUUID();
      const dropId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      const { rows: created } = await client.query(
        `SELECT meal_plan_create_or_update($1::jsonb) AS id`,
        [
          JSON.stringify({
            title: "Recon Plan",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A],
            portionRequirements: [],
            assignments: [
              {
                id: keepId,
                recipeId,
                assignmentDate: "2099-06-01",
                mealSlot: "lunch",
                servings: 2,
              },
              {
                id: dropId,
                recipeId,
                assignmentDate: "2099-06-02",
                mealSlot: "dinner",
                servings: 2,
              },
            ],
          }),
        ],
      );
      const planId = created[0].id as string;

      await client.query(`SELECT meal_plan_create_or_update($1::jsonb)`, [
        JSON.stringify({
          id: planId,
          title: "Recon Plan",
          startDate: "2099-06-01",
          endDate: "2099-06-07",
          householdIds: [HOUSEHOLD_A],
          portionRequirements: [],
          assignments: [
            {
              id: keepId,
              recipeId,
              assignmentDate: "2099-06-01",
              mealSlot: "lunch",
              servings: 3,
            },
          ],
        }),
      ]);

      const asg = await client.query(
        `SELECT id, servings FROM meal_plan_assignment
         WHERE meal_plan_id = $1`,
        [planId],
      );
      expect(asg.rows).toHaveLength(1);
      expect(asg.rows[0].id).toBe(keepId);
      expect(Number(asg.rows[0].servings)).toBe(3);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("zero-count portion rows are not stored", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      const { rows } = await client.query(
        `SELECT meal_plan_create_or_update($1::jsonb) AS id`,
        [
          JSON.stringify({
            title: "Zero Count Plan",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A],
            portionRequirements: [
              {
                portionCategoryId: ADULT_MALE,
                count: 0,
                athleteCount: 0,
              },
              {
                portionCategoryId: ADULT_FEMALE,
                count: 1,
                athleteCount: 0,
              },
            ],
            assignments: [],
          }),
        ],
      );
      const planId = rows[0].id as string;

      const pr = await client.query(
        `SELECT portion_category_id, count
         FROM meal_plan_portion_requirement
         WHERE meal_plan_id = $1`,
        [planId],
      );
      expect(pr.rows).toHaveLength(1);
      expect(pr.rows[0].portion_category_id).toBe(ADULT_FEMALE);
      expect(Number(pr.rows[0].count)).toBe(1);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("out-of-range assignment surfaces 23514", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      let code: string | undefined;
      try {
        await client.query(`SELECT meal_plan_create_or_update($1::jsonb)`, [
          JSON.stringify({
            title: "OOR Plan",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A],
            portionRequirements: [],
            assignments: [
              {
                recipeId,
                assignmentDate: "2099-07-15",
                mealSlot: "dinner",
                servings: 1,
              },
            ],
          }),
        ]);
      } catch (e: unknown) {
        code = (e as { code?: string }).code;
      }
      expect(code).toBe("23514");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("creating-household membership survives reconciliation", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      const { rows } = await client.query(
        `SELECT meal_plan_create_or_update($1::jsonb) AS id`,
        [
          JSON.stringify({
            title: "Creator Survive",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A, HOUSEHOLD_B],
            portionRequirements: [],
            assignments: [],
          }),
        ],
      );
      const planId = rows[0].id as string;

      // Omit creating household from householdIds — must still remain.
      await client.query(`SELECT meal_plan_create_or_update($1::jsonb)`, [
        JSON.stringify({
          id: planId,
          title: "Creator Survive",
          startDate: "2099-06-01",
          endDate: "2099-06-07",
          householdIds: [HOUSEHOLD_B],
          portionRequirements: [],
          assignments: [],
        }),
      ]);

      const mph = await client.query(
        `SELECT household_id FROM meal_plan_household
         WHERE meal_plan_id = $1 ORDER BY household_id`,
        [planId],
      );
      const ids = mph.rows.map((r: { household_id: string }) => r.household_id);
      expect(ids).toContain(HOUSEHOLD_A);
      expect(ids).toContain(HOUSEHOLD_B);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
