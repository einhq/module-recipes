/**
 * Where recipes live and how they are read and written.
 *
 * A recipe is a `recipe` node in `/archive/recipes`, named after its title, its lists and facts in
 * its attrs. Its pictures are files in its `pictures/` directory, one of them its cover. Recipes
 * are the household's: everyone signed in may read them, and a member of the `users` group change
 * them, through the mode they are made with.
 *
 * `/archive/recipes` is unlisted, so the library's views (the photos, the timeline, search's feed)
 * leave the pictures out, and it wants only renditions of them (`processing`), so the pipelines
 * that read faces, text or picture vectors pass them by. The root is the administrator's, so both
 * are set as the administrator, the first time a recipe is written.
 */
import { basename, resolve } from '@std/path';
import { ADMIN_ACCESS, type Command, COVER_LINK_NAME, NodeNotFoundError, nodeOwnership, PROCESSING_ATTR, setCover, UNLISTED_ATTR } from '@ein/client';
import type { Ingredient, Recipe, RecipeCard, RecipeCategory, RecipePage, RecipeStep } from './api.ts';

export const RECIPES_ROOT = '/archive/recipes';
export const RECIPE_TYPE = 'recipe';
const PICTURES_DIR = 'pictures';

/**
 * Readable by everyone signed in, writable by the `users` group the root belongs to. A picture has
 * it too: its renditions are under it, and reaching them takes execute on the picture.
 */
const SHARED_MODE = 0o775;

/** The attrs of a `recipe` node. */
export type RecipeAttrs = {
  title?: string;
  description?: string;
  serves?: number;
  totalMinutes?: number;
  difficulty?: number;
  rating?: number;
  categories?: string[];
  lang?: string;
  source?: { url: string; site?: string };
  allergyInfo?: string;
  ingredients?: Ingredient[];
  steps?: RecipeStep[];
  /** When it was added, as an ISO timestamp: what `--sort newest` orders by. */
  addedAt?: string;
};

/** What a recipe is made with, or changed to: every field but the title optional. */
export type RecipeFields = Omit<RecipeAttrs, 'addedAt' | 'source'> & { source?: string };

/** A recipe command's failure, said to the caller as it is. */
export class RecipeError extends Error {}

/** The name a recipe of this title is made under: lower case, dashes, never empty. */
const slugOf = (title: string): string =>
  title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'recipe';

/** The host of `url` without `www.`, or undefined when it is not an address. */
const siteOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
};

/** A number a flag or form gave, within `min` and `max`, or a `RecipeError` naming the field. */
export const numberIn = (field: string, value: string | number, min: number, max: number): number => {
  const number = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(number) || number < min || number > max) throw new RecipeError(`${field} must be a number from ${min} to ${max}, got '${value}'`);
  return number;
};

const cardOf = (path: string, attrs: RecipeAttrs): RecipeCard => ({
  path,
  title: attrs.title ?? basename(path),
  ...(attrs.description ? { description: attrs.description } : {}),
  ...(attrs.serves ? { serves: attrs.serves } : {}),
  ...(attrs.totalMinutes ? { totalMinutes: attrs.totalMinutes } : {}),
  ...(attrs.difficulty ? { difficulty: attrs.difficulty } : {}),
  ...(attrs.rating ? { rating: attrs.rating } : {}),
  categories: attrs.categories ?? [],
  ...(attrs.lang ? { lang: attrs.lang } : {}),
  ...(attrs.source?.site ? { site: attrs.source.site } : {}),
});

/** The attrs `fields` set, checked; `null` takes an attr away, as an update reads it. */
const attrsOf = (fields: RecipeFields): Record<string, unknown> => {
  const attrs: Record<string, unknown> = {};
  const text = (key: keyof RecipeFields, value: string | undefined) => {
    if (value !== undefined) attrs[key] = value.trim() || null;
  };
  if (fields.title !== undefined) {
    if (!fields.title.trim()) throw new RecipeError('a recipe needs a title');
    attrs.title = fields.title.trim();
  }
  text('description', fields.description);
  text('allergyInfo', fields.allergyInfo);
  text('lang', fields.lang);
  if (fields.serves !== undefined) attrs.serves = fields.serves || null;
  if (fields.totalMinutes !== undefined) attrs.totalMinutes = fields.totalMinutes || null;
  if (fields.difficulty !== undefined) attrs.difficulty = fields.difficulty || null;
  if (fields.rating !== undefined) attrs.rating = fields.rating || null;
  if (fields.categories !== undefined) {
    const categories = [...new Set(fields.categories.map((category) => category.trim()).filter(Boolean))];
    attrs.categories = categories.length ? categories : null;
  }
  if (fields.source !== undefined) {
    const url = fields.source.trim();
    attrs.source = url ? { url, ...(siteOf(url) ? { site: siteOf(url) } : {}) } : null;
  }
  if (fields.ingredients !== undefined) attrs.ingredients = fields.ingredients;
  if (fields.steps !== undefined) attrs.steps = fields.steps;
  return attrs;
};

/** The processing the root wants for the recipes' pictures: renditions, nothing else. */
const ROOT_PROCESSING = ['renditions'];

/** Mark the root unlisted and wanting only renditions, once; see the file's comment. */
const markRoot = async (cmd: Command): Promise<void> => {
  const root = await cmd.sys.vfs.get(ADMIN_ACCESS, RECIPES_ROOT).catch(() => undefined);
  if (!root) throw new RecipeError(`${RECIPES_ROOT} is missing: run mod setup recipes`);
  if (root.attrs[UNLISTED_ATTR] === true && JSON.stringify(root.attrs[PROCESSING_ATTR]) === JSON.stringify(ROOT_PROCESSING)) return;
  await cmd.sys.vfs.update(ADMIN_ACCESS, RECIPES_ROOT, { attrs: { [UNLISTED_ATTR]: true, [PROCESSING_ATTR]: ROOT_PROCESSING } });
};

const picturesOf = async (cmd: Command, path: string): Promise<string[]> => {
  try {
    const entries = await cmd.sys.vfs.children(cmd.access, `${path}/${PICTURES_DIR}`);
    return entries.filter((entry) => entry.node.type === 'file').map((entry) => `${path}/${PICTURES_DIR}/${entry.name}`).sort();
  } catch (error) {
    if (error instanceof NodeNotFoundError) return [];
    throw error;
  }
};

/** The recipe `arg` names, a path or a name in the root; a `RecipeError` when it is not one the caller can read. */
export const readRecipe = async (cmd: Command, arg: string | undefined): Promise<Recipe> => {
  if (!arg) throw new RecipeError('missing recipe');
  const path = arg.includes('/') ? resolve(cmd.cwd, arg) : `${RECIPES_ROOT}/${arg}`;
  let node;
  try {
    node = await cmd.sys.vfs.get<RecipeAttrs>(cmd.access, path);
  } catch {
    throw new RecipeError(`${path}: no such recipe`);
  }
  if (node.type !== RECIPE_TYPE) throw new RecipeError(`${path}: not a recipe`);
  const attrs = node.attrs;
  return {
    ...cardOf(path, attrs),
    ingredients: attrs.ingredients ?? [],
    steps: attrs.steps ?? [],
    ...(attrs.allergyInfo ? { allergyInfo: attrs.allergyInfo } : {}),
    ...(attrs.source?.url ? { source: attrs.source.url } : {}),
    pictures: await picturesOf(cmd, path),
    ownership: nodeOwnership(node),
  };
};

/** The recipe taken from `url`, by its path, when there is one. */
export const findBySource = async (cmd: Command, url: string): Promise<string | undefined> => {
  const rows = await cmd.sys.vfs.query(cmd.access, {
    types: [RECIPE_TYPE],
    within: RECIPES_ROOT,
    where: [{ ref: { path: ['source', 'url'] }, op: 'eq', value: url.trim() }],
    limit: 1,
  });
  return rows[0]?.absPath;
};

/** Make a recipe of `fields`, named after its title, with a number after it when that is taken. */
export const createRecipe = async (cmd: Command, fields: RecipeFields & { title: string }): Promise<Recipe> => {
  const attrs = attrsOf(fields);
  for (const [key, value] of Object.entries(attrs)) if (value === null) delete attrs[key];
  await markRoot(cmd);
  const slug = slugOf(fields.title);
  let name = slug;
  for (let n = 2; await cmd.sys.vfs.exists(cmd.access, `${RECIPES_ROOT}/${name}`, { follow: false }); n++) name = `${slug}-${n}`;
  await cmd.sys.vfs.create(cmd.access, RECIPE_TYPE, RECIPES_ROOT, name, { attrs: { ...attrs, addedAt: new Date().toISOString() }, props: { mode: SHARED_MODE } });
  // Made with the recipe, with its mode, so whoever may change the recipe may add pictures to it.
  await cmd.sys.vfs.create(cmd.access, 'directory', `${RECIPES_ROOT}/${name}`, PICTURES_DIR, { props: { mode: SHARED_MODE } });
  return readRecipe(cmd, `${RECIPES_ROOT}/${name}`);
};

/** Write `fields` to the recipe at `path`; an empty text or list takes the attr away. */
export const updateRecipe = async (cmd: Command, path: string, fields: RecipeFields): Promise<Recipe> => {
  const attrs = attrsOf(fields);
  if (Object.keys(attrs).length === 0) throw new RecipeError('nothing to change');
  await cmd.sys.vfs.update(cmd.access, path, { attrs });
  return readRecipe(cmd, path);
};

type ListOptions = { category?: string; text?: string; sort?: 'title' | 'newest'; after?: string; limit: number };

/** The order recipe titles are listed in: the archive's language's (`CFG_LANGUAGE`). */
const collationOf = (cmd: Command): 'sv' | 'en' => cmd.env.CFG_LANGUAGE?.startsWith('sv') ? 'sv' : 'en';

/** A page of recipes, by title or the newest first, narrowed to a category and to titles holding `text`. */
export const listRecipes = async (cmd: Command, options: ListOptions): Promise<RecipePage> => {
  const where = [
    ...(options.category ? [{ ref: 'categories', op: 'has' as const, value: options.category }] : []),
    ...(options.text?.trim() ? [{ ref: 'title', op: 'contains' as const, value: options.text.trim() }] : []),
  ];
  let after;
  if (options.after) {
    try {
      after = JSON.parse(atob(options.after));
    } catch {
      throw new RecipeError(`--after is not a page this command answered: '${options.after}'`);
    }
  }
  const orderBy = options.sort === 'newest' ? { ref: 'addedAt', dir: 'desc' as const } : { ref: 'title', dir: 'asc' as const, collation: collationOf(cmd) };
  const rows = await cmd.sys.vfs.query(cmd.access, {
    types: [RECIPE_TYPE],
    within: RECIPES_ROOT,
    where,
    orderBy,
    ...(after ? { after } : {}),
    limit: options.limit + 1,
  });
  const page = rows.slice(0, options.limit);
  const last = page.at(-1);
  return {
    recipes: page.map((row) => cardOf(row.absPath, row.node.attrs as RecipeAttrs)),
    ...(rows.length > options.limit && last ? { next: btoa(JSON.stringify({ value: last.sortValue, id: last.id })) } : {}),
  };
};

/** Every category a recipe is in, with how many are, the fullest first. */
export const listCategories = async (cmd: Command): Promise<RecipeCategory[]> => {
  const buckets = await cmd.sys.vfs.aggregate(cmd.access, { types: [RECIPE_TYPE], within: RECIPES_ROOT, group: [{ ref: 'categories', each: true }] });
  return buckets.map((bucket) => ({ name: bucket.key[0], count: bucket.count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

/** Make the cover of the recipe at `path` its picture `picture`, or, with none named, its first when it has no cover yet. */
export const coverRecipe = async (cmd: Command, path: string, picture?: string): Promise<void> => {
  if (!picture) {
    if (await cmd.sys.vfs.exists(cmd.access, `${path}/${COVER_LINK_NAME}`, { follow: false }).catch(() => false)) return;
    picture = (await picturesOf(cmd, path))[0];
    if (!picture) return;
  }
  await setCover(cmd.sys.vfs, cmd.access, path, picture);
};

/**
 * Write `bytes` as the recipe's picture `name`, a number put before its extension when the name is
 * taken, and make it the cover when the recipe has none. Answers the picture's path.
 */
export const addPicture = async (cmd: Command, path: string, name: string, bytes: Uint8Array, mimetype: string): Promise<string> => {
  const dir = `${path}/${PICTURES_DIR}`;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let free = name;
  for (let n = 2; await cmd.sys.vfs.exists(cmd.access, `${dir}/${free}`, { follow: false }); n++) free = `${stem}-${n}${ext}`;
  await cmd.sys.vfs.create(cmd.access, 'file', dir, free, { attrs: { mimetype }, props: { mode: SHARED_MODE } });
  const handle = await cmd.sys.vfs.open(cmd.access, `${dir}/${free}`, { mode: 'w' });
  try {
    await handle.write(bytes);
  } finally {
    await handle.close();
  }
  await coverRecipe(cmd, path);
  return `${dir}/${free}`;
};

/** Say `error` on stderr as `name`'s failure, and answer the exit code for it. */
export const fail = async (cmd: Command, name: string, error: unknown): Promise<number> => {
  await cmd.writeError(`${name}: ${error instanceof Error ? error.message : String(error)}\n`);
  return 1;
};
