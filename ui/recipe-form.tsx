import { CommandForm, type FormField, type FormValues } from '@ein/ui/components';
import { shq } from '@ein/ui/lib';
import type { Recipe } from '../lib/api.ts';
import { linesToText } from '../lib/ingredients.ts';
import { DIFFICULTY_LABELS, recipeRoute } from './format.ts';

const LIST_HELP = 'One per line. A line starting with # names a section, such as # Sauce.';

const FIELDS: FormField[] = [
  { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Apple cake' },
  { key: 'serves', label: 'Serves', type: 'number', half: true, description: 'The servings the amounts are for' },
  { key: 'minutes', label: 'Time in minutes', type: 'number', half: true },
  {
    key: 'difficulty',
    label: 'Difficulty',
    type: 'select',
    half: true,
    options: [{ value: '', label: 'Not said' }, ...[1, 2, 3].map((n) => ({ value: String(n), label: DIFFICULTY_LABELS[n] }))],
  },
  {
    key: 'rating',
    label: 'Rating',
    type: 'select',
    half: true,
    options: [{ value: '', label: 'Not rated' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: '★'.repeat(n) }))],
  },
  { key: 'categories', label: 'Categories', type: 'text', placeholder: 'Baking, Dessert', description: 'Separated by commas' },
  { key: 'ingredients', label: 'Ingredients', type: 'textarea', placeholder: '4 apples\n2 dl sugar\n100 g butter', description: LIST_HELP },
  { key: 'steps', label: 'Steps', type: 'textarea', placeholder: 'Slice the apples.\nBake for 40 minutes at 175 °C.', description: LIST_HELP },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'allergies', label: 'Allergies', type: 'textarea', description: 'What it holds that someone may not eat' },
  { key: 'lang', label: 'Language', type: 'text', half: true, placeholder: 'en', description: 'The language it is written in, such as sv' },
  { key: 'source', label: 'Taken from', type: 'text', half: true, placeholder: 'https://…', description: 'The page it was taken from' },
];

/** Each field's flag, the form's key but for `title`, which `recipe-create` takes as its argument. */
const FLAGS = FIELDS.map((field) => field.key).filter((key) => key !== 'title');

/** A recipe's values as the form holds them. */
const valuesOf = (recipe: Recipe): FormValues => ({
  title: recipe.title,
  serves: recipe.serves ? String(recipe.serves) : '',
  minutes: recipe.totalMinutes ? String(recipe.totalMinutes) : '',
  difficulty: recipe.difficulty ? String(recipe.difficulty) : '',
  rating: recipe.rating ? String(recipe.rating) : '',
  categories: recipe.categories.join(', '),
  ingredients: linesToText(recipe.ingredients),
  steps: linesToText(recipe.steps),
  description: recipe.description ?? '',
  allergies: recipe.allergyInfo ?? '',
  lang: recipe.lang ?? '',
  source: recipe.source ?? '',
});

/**
 * The form a recipe is written in, for `/recipes/new` and `/recipes/edit`. Made, it says only what
 * was filled in; changed, it says every field, so one emptied is taken away.
 */
export function RecipeForm({ recipe }: { recipe?: Recipe }) {
  const build = (values: FormValues) => {
    const flags = FLAGS.filter((key) => recipe || values[key]?.trim()).map((key) => ` --${key} ${shq(values[key] ?? '')}`).join('');
    const command = recipe ? `recipe-set ${shq(recipe.path)} --title ${shq(values.title.trim())}${flags}` : `recipe-create ${shq(values.title.trim())}${flags}`;
    return { command, navigateTo: (answer: unknown) => recipeRoute((answer as Recipe).path) };
  };
  return <CommandForm fields={FIELDS} initial={recipe ? valuesOf(recipe) : {}} build={build} submitLabel={recipe ? 'Save' : 'Create'} />;
}
