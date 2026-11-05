import { ActionIcon, Alert, Anchor, Badge, Box, Container, Grid, Group, Image, Paper, SimpleGrid, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { EmptyState, EntityDetailHeader, PageLoader, TablerIcon } from '@ein/ui/components';
import { forgetCover, useAccessIds, useCommand } from '@ein/ui/hooks';
import { canWrite, fileUrl, shq, THUMB_NAME } from '@ein/ui/lib';
import { execCommand, notify, openDialog } from '@ein/ui/signals';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Ingredient, Recipe, RecipeStep } from '../../lib/api.ts';
import { scaledLine, sectionsOf } from '../../lib/ingredients.ts';
import { DIFFICULTY_LABELS, minutesLabel } from '../format.ts';

/** The recipe's header runs edge to edge. */
export const handle = { fullBleed: true };

const ROOT = '/archive/recipes';

/** A line that can be ticked off while cooking: struck through, and dimmed. */
function Tickable({ done, onToggle, children }: { done: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <UnstyledButton
      onClick={onToggle}
      style={{ display: 'block', width: '100%', textAlign: 'left', opacity: done ? 0.45 : 1, textDecoration: done ? 'line-through' : undefined }}
    >
      {children}
    </UnstyledButton>
  );
}

/** A section's heading, when the section has one. */
function SectionHeading({ group }: { group?: string }) {
  return group ? <Text fw={600} size='sm' tt='uppercase' c='dimmed' mt='sm'>{group}</Text> : null;
}

/** The ingredients, scaled to `serves`, with the control that changes it. */
function Ingredients({ recipe, lang }: { recipe: Recipe; lang?: string }) {
  const [serves, setServes] = useState(recipe.serves ?? 0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (index: number) => setDone((now) => new Set(now.has(index) ? [...now].filter((each) => each !== index) : [...now, index]));
  let index = 0;
  return (
    <Paper withBorder radius='md' p='md'>
      <Group justify='space-between' mb='xs'>
        <Title order={4}>Ingredients</Title>
        {recipe.serves && (
          <Group gap={4} wrap='nowrap'>
            <ActionIcon variant='light' aria-label='Fewer servings' disabled={serves <= 1} onClick={() => setServes(serves - 1)}>
              <TablerIcon name='minus' size={16} />
            </ActionIcon>
            <Text size='sm' w={86} ta='center'>serves {serves}</Text>
            <ActionIcon variant='light' aria-label='More servings' onClick={() => setServes(serves + 1)}>
              <TablerIcon name='plus' size={16} />
            </ActionIcon>
          </Group>
        )}
      </Group>
      <Stack gap={4}>
        {sectionsOf<Ingredient>(recipe.ingredients).map((section, n) => (
          <Box key={n}>
            <SectionHeading group={section.group} />
            {section.items.map((ingredient) => {
              const at = index++;
              const line = scaledLine(ingredient, serves, recipe.serves, lang);
              return (
                <Tickable key={at} done={done.has(at)} onToggle={() => toggle(at)}>
                  <Text py={3}>
                    {line.amount && <Text span fw={700}>{line.amount}</Text>} {line.rest}
                  </Text>
                </Tickable>
              );
            })}
          </Box>
        ))}
        {recipe.ingredients.length === 0 && <Text c='dimmed' size='sm'>No ingredients written down.</Text>}
      </Stack>
    </Paper>
  );
}

/** The steps, numbered through every section. */
function Steps({ steps }: { steps: RecipeStep[] }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (index: number) => setDone((now) => new Set(now.has(index) ? [...now].filter((each) => each !== index) : [...now, index]));
  let index = 0;
  return (
    <Stack gap='xs'>
      <Title order={4}>Steps</Title>
      {sectionsOf<RecipeStep>(steps).map((section, n) => (
        <Box key={n}>
          <SectionHeading group={section.group} />
          {section.items.map((step) => {
            const at = index++;
            return (
              <Tickable key={at} done={done.has(at)} onToggle={() => toggle(at)}>
                <Group gap='sm' align='flex-start' wrap='nowrap' py={6}>
                  <Badge variant='light' radius='xl' size='lg' style={{ flexShrink: 0 }}>{at + 1}</Badge>
                  <Text>{step.text}</Text>
                </Group>
              </Tickable>
            );
          })}
        </Box>
      ))}
      {steps.length === 0 && <Text c='dimmed' size='sm'>No steps written down.</Text>}
    </Stack>
  );
}

/** The recipe's pictures; one that may be changed offers to become its cover. */
function Pictures({ recipe, editable, onCover }: { recipe: Recipe; editable: boolean; onCover: (picture: string) => void }) {
  if (recipe.pictures.length < 2) return null;
  return (
    <SimpleGrid cols={{ base: 2, sm: 4, md: 6 }} spacing='xs'>
      {recipe.pictures.map((picture) => (
        <Box key={picture} pos='relative'>
          <Anchor href={fileUrl(picture)} target='_blank'>
            <Image radius='sm' h={120} fit='cover' src={`${fileUrl(picture)}/thumbnails/${THUMB_NAME}`} fallbackSrc={fileUrl(picture)} alt='' />
          </Anchor>
          {editable && (
            <Tooltip label='Make this its cover'>
              <ActionIcon variant='filled' color='dark' size='sm' pos='absolute' top={6} right={6} aria-label='Make this its cover' onClick={() => onCover(picture)}>
                <TablerIcon name='photo-star' size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Box>
      ))}
    </SimpleGrid>
  );
}

/** The facts under the title: servings, time, difficulty, rating, where it is from. */
function Facts({ recipe }: { recipe: Recipe }) {
  const facts = [
    recipe.serves ? `Serves ${recipe.serves}` : '',
    recipe.totalMinutes ? minutesLabel(recipe.totalMinutes) : '',
    recipe.difficulty ? DIFFICULTY_LABELS[recipe.difficulty] ?? '' : '',
    recipe.rating ? '★'.repeat(recipe.rating) : '',
  ].filter(Boolean);
  return (
    <Stack gap={4}>
      {facts.length > 0 && <Text size='sm' c='dimmed'>{facts.join(' · ')}</Text>}
      {(recipe.categories.length > 0 || recipe.source) && (
        <Group gap={6}>
          {recipe.categories.map((category) => <Badge key={category} size='sm' variant='light'>{category}</Badge>)}
          {recipe.source && (
            <Anchor href={recipe.source} target='_blank' rel='noreferrer' size='sm'>
              {recipe.site ?? 'Original'} <TablerIcon name='external-link' size={12} />
            </Anchor>
          )}
        </Group>
      )}
    </Stack>
  );
}

/**
 * `/recipes/:name`: one recipe, its cover in the header, its ingredients beside its steps. The
 * ingredients scale to the servings chosen, and a line or a step tapped is struck through, for
 * keeping one's place while cooking; neither is saved.
 */
export default function RecipePage() {
  const { name = '' } = useParams();
  const path = `${ROOT}/${name}`;
  const recipe = useCommand<Recipe>(`recipe-show ${shq(path)}`);
  const access = useAccessIds();

  if (recipe.loading && !recipe.data) return <PageLoader label='Loading recipe…' />;
  if (!recipe.data) return <EmptyState title='No such recipe'>{recipe.error?.message ?? path}</EmptyState>;
  const shown = recipe.data;
  const editable = canWrite(shown.ownership, access);

  const cover = async (picture?: string) => {
    try {
      await execCommand(`recipe-cover ${shq(shown.path)}${picture ? ` ${shq(picture)}` : ''}`);
      forgetCover(shown.path);
      await recipe.refetch();
    } catch (err) {
      notify({ message: err instanceof Error ? err.message : String(err), color: 'red' });
    }
  };

  return (
    <Box>
      <EntityDetailHeader
        path={shown.path}
        pattern='mixed'
        title={shown.title}
        fallback={<TablerIcon name='chef-hat' size={52} />}
        meta={<Facts recipe={shown} />}
        actions={editable
          ? {
            upload: { path: `${shown.path}/pictures`, name: shown.title, onUploaded: () => void cover() },
            share: shown.path,
            edit: () => openDialog(`/recipes/edit?path=${encodeURIComponent(shown.path)}`),
            trash: { path: shown.path, name: shown.title, leaveTo: '/recipes' },
          }
          : undefined}
      />
      <Container size='xl' py='md' px='md' style={{ '--mrx-body-padding': 'var(--mantine-spacing-md)' } as CSSProperties}>
        <Stack gap='lg'>
          {shown.description && <Text maw='70ch'>{shown.description}</Text>}
          {shown.allergyInfo && (
            <Alert variant='light' color='yellow' icon={<TablerIcon name='alert-triangle' size={16} />} title='Allergies'>
              <Text size='sm' style={{ whiteSpace: 'pre-line' }}>{shown.allergyInfo}</Text>
            </Alert>
          )}
          <Grid gap='lg'>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Ingredients key={`${shown.path}:${shown.serves}`} recipe={shown} lang={shown.lang} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Steps key={shown.path} steps={shown.steps} />
            </Grid.Col>
          </Grid>
          <Pictures recipe={shown} editable={editable} onCover={(picture) => void cover(picture)} />
        </Stack>
      </Container>
    </Box>
  );
}
