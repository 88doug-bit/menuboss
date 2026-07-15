-- MenuBoss seed.sql
-- Deterministic, idempotent (fixed UUIDs + ON CONFLICT DO NOTHING).
-- Production: load units / portion_category / family_settings / category / tag only.
-- Strip or skip the TEST FIXTURES section in production environments.

-- ===========================================================================
-- Units (mass base = gram; volume base = milliliter; count base = each)
-- ===========================================================================

INSERT INTO unit (id, name, abbreviation, dimension, factor_to_base, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000101', 'gram',        'g',     'mass',   1,        10),
  ('00000000-0000-4000-8000-000000000102', 'kilogram',    'kg',    'mass',   1000,     20),
  ('00000000-0000-4000-8000-000000000103', 'ounce',       'oz',    'mass',   28.3495,  30),
  ('00000000-0000-4000-8000-000000000104', 'pound',       'lb',    'mass',   453.592,  40),
  ('00000000-0000-4000-8000-000000000111', 'milliliter',  'ml',    'volume', 1,        50),
  ('00000000-0000-4000-8000-000000000112', 'liter',       'l',     'volume', 1000,     60),
  ('00000000-0000-4000-8000-000000000113', 'teaspoon',    'tsp',   'volume', 4.92892,  70),
  ('00000000-0000-4000-8000-000000000114', 'tablespoon',  'tbsp',  'volume', 14.7868,  80),
  ('00000000-0000-4000-8000-000000000115', 'cup',         'cup',   'volume', 236.588,  90),
  ('00000000-0000-4000-8000-000000000116', 'fluid_ounce', 'fl_oz', 'volume', 29.5735, 100),
  ('00000000-0000-4000-8000-000000000121', 'each',        'ea',    'count',  1,       110),
  ('00000000-0000-4000-8000-000000000122', 'dozen',       'doz',   'count',  12,      120),
  ('00000000-0000-4000-8000-000000000123', 'clove',       'clove', 'count',  1,       130),
  ('00000000-0000-4000-8000-000000000124', 'head',        'head',  'count',  1,       140)
ON CONFLICT (name) DO NOTHING;

-- ===========================================================================
-- Portion categories (9) — Adult Male reference base 6.0 oz
-- ===========================================================================

INSERT INTO portion_category (id, name, slug, base_protein_oz, description, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000201', 'Child',                      'child',                        3.0,  'Young children', 10),
  ('00000000-0000-4000-8000-000000000202', 'Adolescent Female Under 15',  'adolescent-female-under-15',   4.0,  NULL, 20),
  ('00000000-0000-4000-8000-000000000203', 'Adolescent Female Over 15',   'adolescent-female-over-15',    5.0,  NULL, 30),
  ('00000000-0000-4000-8000-000000000204', 'Adolescent Male Under 15',    'adolescent-male-under-15',     5.0,  NULL, 40),
  ('00000000-0000-4000-8000-000000000205', 'Adolescent Male Over 15',     'adolescent-male-over-15',      6.0,  NULL, 50),
  ('00000000-0000-4000-8000-000000000206', 'Adult Female',                'adult-female',                 5.0,  NULL, 60),
  ('00000000-0000-4000-8000-000000000207', 'Adult Male',                  'adult-male',                   6.0,  'Reference base portion (default 6.0 oz)', 70),
  ('00000000-0000-4000-8000-000000000208', 'Senior Female',               'senior-female',                4.5,  NULL, 80),
  ('00000000-0000-4000-8000-000000000209', 'Senior Male',                 'senior-male',                  5.0,  NULL, 90)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- Family settings (single row)
-- ===========================================================================

INSERT INTO family_settings (id, athlete_multiplier, other_global_defaults) VALUES
  ('00000000-0000-4000-8000-000000000301', 1.5, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- Category taxonomy starter (nutrition)
-- Protein > Seafood / Poultry / Pork / Beef
-- Starch > Grains / Potatoes
-- Vegetable; Fruit; Dairy
-- ===========================================================================

INSERT INTO category (id, name, slug, parent_id, category_type, sort_order, description) VALUES
  ('00000000-0000-4000-8000-000000000401', 'Protein',   'protein',   NULL, 'nutrition', 10, 'Top-level protein foods'),
  ('00000000-0000-4000-8000-000000000402', 'Starch',    'starch',    NULL, 'nutrition', 20, 'Starches and carbs'),
  ('00000000-0000-4000-8000-000000000403', 'Vegetable', 'vegetable', NULL, 'nutrition', 30, NULL),
  ('00000000-0000-4000-8000-000000000404', 'Fruit',     'fruit',     NULL, 'nutrition', 40, NULL),
  ('00000000-0000-4000-8000-000000000405', 'Dairy',     'dairy',     NULL, 'nutrition', 50, NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO category (id, name, slug, parent_id, category_type, sort_order, description) VALUES
  ('00000000-0000-4000-8000-000000000411', 'Seafood',  'seafood',  '00000000-0000-4000-8000-000000000401', 'nutrition', 11, NULL),
  ('00000000-0000-4000-8000-000000000412', 'Poultry',  'poultry',  '00000000-0000-4000-8000-000000000401', 'nutrition', 12, NULL),
  ('00000000-0000-4000-8000-000000000413', 'Pork',     'pork',     '00000000-0000-4000-8000-000000000401', 'nutrition', 13, NULL),
  ('00000000-0000-4000-8000-000000000414', 'Beef',     'beef',     '00000000-0000-4000-8000-000000000401', 'nutrition', 14, NULL),
  ('00000000-0000-4000-8000-000000000421', 'Grains',   'grains',   '00000000-0000-4000-8000-000000000402', 'nutrition', 21, NULL),
  ('00000000-0000-4000-8000-000000000422', 'Potatoes', 'potatoes', '00000000-0000-4000-8000-000000000402', 'nutrition', 22, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- Tags by tag_group
-- ===========================================================================

INSERT INTO tag (id, name, slug, tag_group, description) VALUES
  -- applicable_meal
  ('00000000-0000-4000-8000-000000000501', 'Breakfast',  'breakfast',  'applicable_meal', NULL),
  ('00000000-0000-4000-8000-000000000502', 'Lunch',      'lunch',      'applicable_meal', NULL),
  ('00000000-0000-4000-8000-000000000503', 'Dinner',     'dinner',     'applicable_meal', NULL),
  ('00000000-0000-4000-8000-000000000504', 'Snack',      'snack',      'applicable_meal', NULL),
  -- cuisine
  ('00000000-0000-4000-8000-000000000511', 'American',       'american',       'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000512', 'Italian',        'italian',        'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000513', 'Mexican',        'mexican',        'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000514', 'Greek',          'greek',          'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000515', 'Mediterranean',  'mediterranean',  'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000516', 'Asian',          'asian',          'cuisine', NULL),
  -- preparation_method
  ('00000000-0000-4000-8000-000000000521', 'Grill',     'grill',     'preparation_method', NULL),
  ('00000000-0000-4000-8000-000000000522', 'Roast',     'roast',     'preparation_method', NULL),
  ('00000000-0000-4000-8000-000000000523', 'Sauté',     'saute',     'preparation_method', NULL),
  ('00000000-0000-4000-8000-000000000524', 'Slow Cook', 'slow-cook', 'preparation_method', NULL),
  ('00000000-0000-4000-8000-000000000525', 'Bake',      'bake',      'preparation_method', NULL),
  -- dietary_restriction
  ('00000000-0000-4000-8000-000000000531', 'Gluten-Free', 'gluten-free', 'dietary_restriction', NULL),
  ('00000000-0000-4000-8000-000000000532', 'Dairy-Free',  'dairy-free',  'dietary_restriction', NULL),
  ('00000000-0000-4000-8000-000000000533', 'Nut-Free',    'nut-free',    'dietary_restriction', NULL),
  ('00000000-0000-4000-8000-000000000534', 'Vegetarian',  'vegetarian',  'dietary_restriction', NULL),
  ('00000000-0000-4000-8000-000000000535', 'Vegan',       'vegan',       'dietary_restriction', NULL),
  -- difficulty
  ('00000000-0000-4000-8000-000000000541', 'Easy',     'easy',     'difficulty', NULL),
  ('00000000-0000-4000-8000-000000000542', 'Medium',   'medium',   'difficulty', NULL),
  ('00000000-0000-4000-8000-000000000543', 'Advanced', 'advanced', 'difficulty', NULL)
ON CONFLICT (tag_group, slug) DO NOTHING;

-- ===========================================================================
-- >>> BEGIN TEST FIXTURES (exclude in production)
-- RLS matrix personas: member_a, member_b, member_c, admin_a (anon = no profile row)
-- Households A / B / C
-- ===========================================================================

INSERT INTO household (id, name, family_id, is_active) VALUES
  ('00000000-0000-4000-8000-0000000000a0', 'Household A', 'menuboss-family', true),
  ('00000000-0000-4000-8000-0000000000b0', 'Household B', 'menuboss-family', true),
  ('00000000-0000-4000-8000-0000000000c0', 'Household C', 'menuboss-family', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profile (id, household_id, display_name, role) VALUES
  -- member_a: regular member of Household A
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a0', 'Member A', 'member'),
  -- admin_a: family admin in Household A
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a0', 'Admin A',  'admin'),
  -- member_b: Household B
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b0', 'Member B', 'member'),
  -- member_c: Household C (never shared)
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c0', 'Member C', 'member')
ON CONFLICT (id) DO NOTHING;

-- Fixed UUID reference card for pgTAP / RLS matrix:
--   household_a = 00000000-0000-4000-8000-0000000000a0
--   household_b = 00000000-0000-4000-8000-0000000000b0
--   household_c = 00000000-0000-4000-8000-0000000000c0
--   member_a    = 00000000-0000-4000-8000-0000000000a1
--   admin_a     = 00000000-0000-4000-8000-0000000000a2
--   member_b    = 00000000-0000-4000-8000-0000000000b1
--   member_c    = 00000000-0000-4000-8000-0000000000c1
--   anon        = (no profile row)

-- ===========================================================================
-- <<< END TEST FIXTURES
-- ===========================================================================
