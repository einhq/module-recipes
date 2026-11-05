import { RecipeForm } from '../recipe-form.tsx';

/** The shell's dialog takes its frame from here; as a page, this is its heading. */
export const handle = { title: 'New recipe', icon: 'chef-hat', pattern: 'mixed', dialogSize: 'lg', signedIn: true };

/** `/recipes/new`, in the dialog from the top bar's Create menu or as a page of its own. */
export default function NewRecipePage() {
  return <RecipeForm />;
}
