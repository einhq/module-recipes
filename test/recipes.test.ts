/**
 * Recipes through their commands: one is made under /archive/recipes, read back whole, changed, listed
 * a page at a time and by category, found by search, and its pictures stay out of the library's views.
 * The same steps run on the memory store and, in the PostgreSQL tier, on PostgreSQL, whose
 * collation, substring match and paging are its own.
 */
import { assert, assertEquals, assertRejects } from '@std/assert';
import { createTestContext, pgTest, pgTestContext, type ShellClient, SystemTestHarness } from '@ein/testing';
import type { SearchProviderResponse } from '@ein/api';
import type { Recipe, RecipeCategory, RecipePage } from '@recipes/api';

type Connect = (login?: { username: string; password: string }) => Promise<ShellClient>;

const steps = async (t: Deno.TestContext, connect: Connect) => {
  const admin = await connect();
  const clients: ShellClient[] = [admin];

  try {
    for (const name of ['anna', 'bo']) await admin.execString(`user-create ${name} && user-passwd ${name} --new-password hunter2`);
    const anna = await connect({ username: 'anna', password: 'hunter2' });
    const bo = await connect({ username: 'bo', password: 'hunter2' });
    clients.push(anna, bo);

    let cake: Recipe;

    await t.step('a recipe is made with its lists read into amounts', async () => {
      cake = await anna.execJson<Recipe>(
        "recipe-create 'Äppelkaka' --serves 8 --minutes 60 --categories 'Baking, Dessert' --lang sv --source https://www.example.org/appelkaka " +
          "--ingredients $'4 äpplen\\n# Smet\\n2 dl socker\\n100 g smör' --steps $'1. Skala äpplena.\\n2. Grädda i 40 minuter.'",
      );
      assertEquals(cake.path, '/archive/recipes/appelkaka');
      assertEquals([cake.serves, cake.totalMinutes, cake.lang, cake.site], [8, 60, 'sv', 'example.org']);
      assertEquals(cake.categories, ['Baking', 'Dessert']);
      assertEquals(cake.ingredients[1], { group: 'Smet', raw: '2 dl socker', quantity: 2, unit: 'dl', name: 'socker' });
      assertEquals(cake.steps.map((step) => step.text), ['Skala äpplena.', 'Grädda i 40 minuter.']);
      assertEquals(cake.pictures, []);
    });

    await t.step('the root is unlisted and wants only renditions, so its pictures stay out of the library and its analysis', async () => {
      const root = await admin.execJson<{ attrs: Record<string, unknown> }>('stat /archive/recipes');
      assertEquals(root.attrs.unlisted, true);
      assertEquals(root.attrs.processing, ['renditions']);
    });

    await t.step('a second recipe of the same title gets a name of its own', async () => {
      assertEquals((await bo.execJson<Recipe>("recipe-create 'Äppelkaka'")).path, '/archive/recipes/appelkaka-2');
    });

    await t.step('anyone signed in may change a recipe, and an empty field is taken away', async () => {
      const changed = await bo.execJson<Recipe>(`recipe-set appelkaka --serves 4 --minutes '' --rating 5`);
      assertEquals([changed.serves, changed.totalMinutes, changed.rating], [4, undefined, 5]);
      await assertRejects(() => anna.execJson('recipe-set appelkaka --difficulty 7'));
      await assertRejects(() => anna.execJson("recipe-set appelkaka --title ''"));
    });

    await t.step('the list pages through the recipes, and narrows to a category and to words in the title', async () => {
      for (const title of ['Pannkakor', 'Kladdkaka', 'Ärtsoppa']) await anna.execJson(`recipe-create ${title} --categories Dinner`);
      const first = await anna.execJson<RecipePage>('recipe-list --limit 3');
      assertEquals(first.recipes.length, 3);
      assert(first.next);
      const rest = await anna.execJson<RecipePage>(`recipe-list --limit 3 --after ${first.next}`);
      assertEquals(rest.next, undefined);
      assertEquals([...first.recipes, ...rest.recipes].length, 5);
      assertEquals((await anna.execJson<RecipePage>('recipe-list --category Dinner')).recipes.map((recipe) => recipe.title).sort(), ['Kladdkaka', 'Pannkakor', 'Ärtsoppa']);
      assertEquals((await anna.execJson<RecipePage>('recipe-list kaka --category Dinner')).recipes.map((recipe) => recipe.title), ['Kladdkaka']);
      assertEquals((await anna.execJson<RecipePage>('recipe-list --sort newest --limit 1')).recipes[0].title, 'Ärtsoppa');
      assertEquals(await anna.execJson<RecipeCategory[]>('recipe-categories'), [{ name: 'Dinner', count: 3 }, { name: 'Baking', count: 1 }, { name: 'Dessert', count: 1 }]);
    });

    await t.step('search finds a recipe by its title, in the unlisted root too', async () => {
      const found = await anna.execJson<SearchProviderResponse>('search-recipe soppa');
      assertEquals(found.results.map((hit) => [hit.path, hit.channel]), [['/archive/recipes/artsoppa', 'name']]);
      const searched = await anna.execJson<{ results: { path: string }[] }>('search soppa');
      assertEquals(searched.results.map((hit) => hit.path), ['/archive/recipes/artsoppa']);
    });

    await t.step('a picture put in its pictures becomes its cover', async () => {
      await anna.execString('echo picture > /archive/recipes/appelkaka/pictures/baked.jpg && recipe-cover appelkaka');
      const shown = await bo.execJson<Recipe>('recipe-show appelkaka');
      assertEquals(shown.pictures, ['/archive/recipes/appelkaka/pictures/baked.jpg']);
      const cover = await bo.execJson<{ props: { softlink?: string } }>('stat -L /archive/recipes/appelkaka/coverPhoto');
      assertEquals(cover.props.softlink, '/archive/recipes/appelkaka/pictures/baked.jpg');
      await assertRejects(() => anna.execJson('recipe-cover appelkaka other.jpg'));
    });
  } finally {
    for (const client of clients) client.close();
  }
};

const testCtx = createTestContext({ modules: ['recipes'], boot: true });

Deno.test({ name: 'recipes', sanitizeResources: false, sanitizeOps: false }, async (t) => {
  await testCtx.setup();
  await steps(t, (login) => testCtx.server.createShellClient(login));
});

pgTest('recipes on PostgreSQL', async (t) => {
  const ctx = pgTestContext();
  const harness = new SystemTestHarness({ ssh: false, modules: ['recipes'], pg: { pool: ctx.pool, prefix: ctx.prefix } });
  try {
    await harness.start();
    await steps(t, (login) => harness.createShellClient(login));
  } finally {
    await harness.stop();
    await ctx.teardown();
  }
});
