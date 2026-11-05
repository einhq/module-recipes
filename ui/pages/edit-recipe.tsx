import { EmptyState, PageLoader } from '@ein/ui/components';
import { useCommand } from '@ein/ui/hooks';
import { shq } from '@ein/ui/lib';
import { useSearchParams } from 'react-router-dom';
import type { Recipe } from '../../lib/api.ts';
import { RecipeForm } from '../recipe-form.tsx';

/** The shell's dialog takes its frame from here; as a page, this is its heading. */
export const handle = { title: 'Edit recipe', icon: 'chef-hat', pattern: 'mixed', dialogSize: 'lg', signedIn: true };

/** `/recipes/edit?path=<recipe>`: the recipe's form, filled in with what it says now. */
export default function EditRecipePage() {
  const [params] = useSearchParams();
  const path = params.get('path') ?? '';
  const recipe = useCommand<Recipe>(`recipe-show ${shq(path)}`);
  if (recipe.loading && !recipe.data) return <PageLoader />;
  if (!recipe.data) return <EmptyState title='No such recipe'>{recipe.error?.message ?? path}</EmptyState>;
  return <RecipeForm recipe={recipe.data} />;
}
