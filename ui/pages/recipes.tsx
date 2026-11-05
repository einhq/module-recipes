import { Badge, Box, Button, Center, Loader, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
  BrowseEntityCard,
  CardGrid,
  EmptyState,
  EntityDetailHeader,
  HeaderChoice,
  HeaderChoices,
  HeaderFilterBar,
  ListFilterInput,
  PageLoader,
  TablerIcon,
} from '@ein/ui/components';
import { useCommand, useLoadMoreSentinel, usePersistedState, useUrlParam } from '@ein/ui/hooks';
import { shq } from '@ein/ui/lib';
import { execCommand, isAuthenticated, openDialog } from '@ein/ui/signals';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RecipeCard, RecipeCategory, RecipePage } from '../../lib/api.ts';
import { minutesLabel, recipeRoute } from '../format.ts';

/** The page draws its own band edge to edge. */
export const handle = { fullBleed: true };

type Sort = 'title' | 'newest';

/** A card's facts under its title: how many it serves, how long it takes, where it is from. */
function Facts({ recipe }: { recipe: RecipeCard }) {
  return (
    <>
      {recipe.serves && <Badge size='xs' variant='light' color='gray'>serves {recipe.serves}</Badge>}
      {recipe.totalMinutes && <Badge size='xs' variant='light' color='gray'>{minutesLabel(recipe.totalMinutes)}</Badge>}
      {recipe.site && <Badge size='xs' variant='light' color='orange'>{recipe.site}</Badge>}
    </>
  );
}

const hasFacts = (recipe: RecipeCard): boolean => Boolean(recipe.serves || recipe.totalMinutes || recipe.site || recipe.categories.length);

/**
 * `/recipes`: every recipe as a card, by title or the newest first, narrowed to a category and to
 * titles holding the filter's words. Read a page at a time (`recipe-list`), the next as the grid's
 * end comes near.
 */
export default function RecipesPage() {
  const navigate = useNavigate();
  const [text, setText] = useUrlParam('q');
  const [category, setCategory] = useUrlParam('category');
  const [sort, setSort] = usePersistedState<Sort>('recipes.list.sort', 'title');
  const [wanted] = useDebouncedValue(text, 250);
  const categories = useCommand<RecipeCategory[]>('recipe-categories');

  const [recipes, setRecipes] = useState<RecipeCard[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which question the answers on screen are to, so a slow answer to an older one is dropped.
  const asked = useRef('');

  const command = `recipe-list${wanted.trim() ? ` ${shq(wanted.trim())}` : ''}${category ? ` --category ${shq(category)}` : ''} --sort ${sort}`;

  const read = useCallback(async (after?: string) => {
    const question = command;
    asked.current = question;
    setLoading(true);
    try {
      const page = await execCommand<RecipePage>(after ? `${question} --after ${shq(after)}` : question);
      if (asked.current !== question) return;
      setRecipes((shown) => after ? [...shown, ...page.recipes] : page.recipes);
      setNext(page.next);
      setError(null);
    } catch (err) {
      if (asked.current === question) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (asked.current === question) setLoading(false);
    }
  }, [command]);

  useEffect(() => {
    void read();
  }, [read]);

  const sentinel = useLoadMoreSentinel(Boolean(next), loading, () => void read(next));
  const narrowed = Boolean(wanted.trim() || category);

  return (
    <Box>
      <EntityDetailHeader
        title='Recipes'
        pattern='mixed'
        flowContent
        actions={isAuthenticated.value ? { items: [{ label: 'New recipe', icon: 'plus', button: true, onClick: () => openDialog('/recipes/new') }] } : undefined}
        controls={
          <HeaderFilterBar input={<ListFilterInput value={text} onChange={setText} what='recipes' />}>
            <HeaderChoices>
              <HeaderChoice
                label='Category'
                value={category}
                onChange={setCategory}
                options={[
                  { value: '', label: 'All categories', icon: <TablerIcon name='category' size={18} /> },
                  ...(categories.data ?? []).map((each) => ({ value: each.name, label: `${each.name} (${each.count})`, icon: <TablerIcon name='tag' size={18} /> })),
                ]}
              />
              <HeaderChoice
                label='Sort'
                value={sort}
                onChange={(value) => setSort(value as Sort)}
                options={[
                  { value: 'title', label: 'Title (A-Z)', icon: <TablerIcon name='sort-ascending-letters' size={18} /> },
                  { value: 'newest', label: 'Newest first', icon: <TablerIcon name='clock' size={18} /> },
                ]}
              />
            </HeaderChoices>
          </HeaderFilterBar>
        }
      />

      <Box px='md' py='lg'>
        {error && <Text c='red' mb='md'>{error}</Text>}
        {loading && recipes.length === 0 ? <PageLoader /> : (
          <>
            <CardGrid items={recipes} itemKey={(recipe) => recipe.path} textParts={(recipe) => ({ description: Boolean(recipe.description), badges: hasFacts(recipe) })}>
              {(recipe) => (
                <BrowseEntityCard
                  title={recipe.title}
                  description={recipe.description}
                  coverPath={recipe.path}
                  icon={<TablerIcon name='chef-hat' size={40} />}
                  onClick={() => navigate(recipeRoute(recipe.path))}
                  labels={recipe.categories}
                  badges={hasFacts(recipe) && <Facts recipe={recipe} />}
                />
              )}
            </CardGrid>
            {next && (
              <Center ref={sentinel} py='lg'>
                <Loader size='sm' />
              </Center>
            )}
            {recipes.length === 0 && !narrowed && !error && (
              <EmptyState
                title='No recipes yet'
                actions={isAuthenticated.value && <Button variant='light' onClick={() => openDialog('/recipes/new')}>New recipe</Button>}
              >
                A recipe holds its ingredients and steps, and scales the ingredients to the servings you want.
              </EmptyState>
            )}
            {recipes.length === 0 && narrowed && !loading && (
              <Box ta='center' py='xl'>
                <Text c='dimmed'>No recipes match</Text>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
