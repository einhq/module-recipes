/**
 * The flags `recipe-create` and `recipe-set` share: a recipe's fields as a command line gives them.
 * The lists are text, one entry per line with `#` lines naming sections, as a form's text box holds
 * them (`ingredients.ts`).
 */
import { ingredientsFromText, stepsFromText } from './ingredients.ts';
import { numberIn, type RecipeFields } from './store.ts';

/** The string flags, for `parseArgs`. */
export const FIELD_FLAGS = ['title', 'description', 'serves', 'minutes', 'difficulty', 'rating', 'categories', 'lang', 'source', 'allergies', 'ingredients', 'steps'];

type Flags = Record<string, unknown>;

const text = (flags: Flags, name: string): string | undefined => flags[name] === undefined ? undefined : String(flags[name]);

/** A number flag; empty takes the field away (0). */
const number = (flags: Flags, name: string, field: string, min: number, max: number): number | undefined => {
  const value = text(flags, name);
  if (value === undefined) return undefined;
  return value.trim() === '' ? 0 : numberIn(field, value, min, max);
};

/** The fields the flags give; a flag not given leaves its field as it is. */
export const fieldsOf = (flags: Flags): RecipeFields => {
  const fields: RecipeFields = {};
  const put = <K extends keyof RecipeFields>(key: K, value: RecipeFields[K] | undefined) => {
    if (value !== undefined) fields[key] = value;
  };
  put('title', text(flags, 'title'));
  put('description', text(flags, 'description'));
  put('allergyInfo', text(flags, 'allergies'));
  put('lang', text(flags, 'lang'));
  put('source', text(flags, 'source'));
  put('serves', number(flags, 'serves', '--serves', 1, 100));
  put('totalMinutes', number(flags, 'minutes', '--minutes', 1, 10_000));
  put('difficulty', number(flags, 'difficulty', '--difficulty', 1, 3));
  put('rating', number(flags, 'rating', '--rating', 1, 5));
  const categories = text(flags, 'categories');
  if (categories !== undefined) fields.categories = categories.split(',');
  const ingredients = text(flags, 'ingredients');
  if (ingredients !== undefined) fields.ingredients = ingredientsFromText(ingredients);
  const steps = text(flags, 'steps');
  if (steps !== undefined) fields.steps = stepsFromText(steps);
  return fields;
};

/** The shared flags' entries for a command's spec. */
export const FIELD_SPECS = [
  { name: 'description', type: 'string' as const, description: 'a line or two about it' },
  { name: 'serves', type: 'number' as const, description: 'how many servings the amounts are for' },
  { name: 'minutes', type: 'number' as const, description: 'how long it takes in all, in minutes' },
  { name: 'difficulty', type: 'number' as const, description: '1 easy, 2 medium, 3 demanding' },
  { name: 'rating', type: 'number' as const, description: 'how good it is, 1 to 5' },
  { name: 'categories', type: 'string' as const, description: 'the categories it is in, separated by commas (Dinner, Fish)' },
  { name: 'lang', type: 'string' as const, description: 'the language it is written in, such as sv or en' },
  { name: 'source', type: 'string' as const, description: 'the address of the page it was taken from' },
  { name: 'allergies', type: 'string' as const, description: 'what it holds that someone may not eat' },
  { name: 'ingredients', type: 'string' as const, description: 'the ingredients, one per line; a line starting with # names a section' },
  { name: 'steps', type: 'string' as const, description: 'the steps, one per line; a line starting with # names a section' },
];
