/**
 * A recipe's ingredient and step lines: parsed into amounts, written back as text, scaled to
 * another number of servings, and grouped into their sections. Pure, for the commands and the
 * pages alike.
 *
 * As text, a recipe's lists are one entry per line, and a line starting with `#` names the section
 * the lines after it belong to (`# Sauce`), until the next such line.
 */
import type { Ingredient, RecipeStep } from './api.ts';

/** The units an ingredient's amount is read with, Swedish and English. Anything else is part of its name. */
const UNITS = new Set([
  'g',
  'kg',
  'ml',
  'cl',
  'dl',
  'l',
  'msk',
  'tsk',
  'krm',
  'st',
  'port',
  'förp',
  'pkt',
  'burk',
  'skiva',
  'skivor',
  'klyfta',
  'klyftor',
  'knippe',
  'nypa',
  'tbsp',
  'tsp',
  'cup',
  'cups',
  'oz',
  'lb',
  'pinch',
  'clove',
  'cloves',
]);

const VULGAR: Record<string, number> = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8 };

/** A leading amount: `1 1/2`, `1½`, `1/2`, `½`, `1,5`, `1.5` or `1`; a range (`2-3`) is read as its first number. */
const AMOUNT = /^(\d+\s+\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛]|\d+\/\d+|[½⅓⅔¼¾⅛]|\d+[.,]\d+|\d+)(?:\s*[-–]\s*[\d.,½⅓⅔¼¾⅛/]+)?\s*/;

const amountOf = (text: string): number => {
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const vulgar = text.match(/^(\d*)\s*([½⅓⅔¼¾⅛])$/);
  if (vulgar) return Number(vulgar[1] || 0) + VULGAR[vulgar[2]];
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(text.replace(',', '.'));
};

/**
 * One ingredient line as its amount, unit and name, as far as they can be read: `2 dl mjölk` is 2,
 * `dl`, `mjölk`. An aside in parentheses, an `eller …`/`or …` alternative and a leading `ca`/`ev`
 * are left out of the reading, never out of `raw`. A line with no amount has only `raw` and `name`.
 */
export const parseIngredient = (line: string, group?: string): Ingredient => {
  const raw = line.trim();
  const base: Ingredient = group ? { group, raw } : { raw };
  let text = raw.replace(/\(.*?\)/g, ' ').replace(/\s(eller|or)\s.*$/i, '').replace(/^(ca|ev|about)\.?\s+/i, '').replace(/\s+/g, ' ').trim();
  const amount = text.match(AMOUNT);
  if (!amount) return text ? { ...base, name: text } : base;
  const quantity = amountOf(amount[1]);
  if (!Number.isFinite(quantity)) return { ...base, name: text };
  text = text.slice(amount[0].length).trim();
  const word = text.match(/^(\S+)(\s+|$)/);
  const unit = word && UNITS.has(word[1].toLowerCase().replace(/\.$/, '')) ? word[1].toLowerCase().replace(/\.$/, '') : undefined;
  if (unit) text = text.slice(word![0].length).trim();
  return { ...base, quantity, ...(unit ? { unit } : {}), ...(text ? { name: text } : {}) };
};

/** The lines of `text`, each with the section a `#` line before it named. Blank lines are skipped. */
const sectionedLines = (text: string): { group?: string; line: string }[] => {
  const lines: { group?: string; line: string }[] = [];
  let group: string | undefined;
  for (const line of text.split('\n').map((each) => each.trim())) {
    if (!line) continue;
    if (line.startsWith('#')) group = line.replace(/^#+/, '').trim() || undefined;
    else lines.push(group ? { group, line } : { line });
  }
  return lines;
};

/** Ingredients from their text, one per line, `#` lines naming sections. */
export const ingredientsFromText = (text: string): Ingredient[] => sectionedLines(text).map(({ group, line }) => parseIngredient(line, group));

/** Steps from their text, one per line, `#` lines naming sections; a leading `1.` or `1)` is dropped. */
export const stepsFromText = (text: string): RecipeStep[] =>
  sectionedLines(text).map(({ group, line }) => {
    const step = line.replace(/^\d+\s*[.)]\s+/, '');
    return group ? { group, text: step } : { text: step };
  });

/** Ingredients or steps as text, the inverse of `ingredientsFromText` and `stepsFromText`. */
export const linesToText = (items: readonly (Ingredient | RecipeStep)[]): string => {
  const lines: string[] = [];
  let group: string | undefined;
  for (const item of items) {
    if (item.group !== group) {
      group = item.group;
      if (lines.length) lines.push('');
      if (group) lines.push(`# ${group}`);
    }
    lines.push('raw' in item ? item.raw : item.text);
  }
  return lines.join('\n');
};

/** Runs of items of the same section, in order: what a page shows under one heading each. */
export const sectionsOf = <T extends { group?: string }>(items: readonly T[]): { group?: string; items: T[] }[] => {
  const sections: { group?: string; items: T[] }[] = [];
  for (const item of items) {
    const last = sections.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ ...(item.group ? { group: item.group } : {}), items: [item] });
  }
  return sections;
};

/** An amount as a cook reads it: whole above ten, one decimal below, two below one; in `locale`'s numbers. */
export const formatQuantity = (quantity: number, locale?: string): string => {
  const rounded = quantity >= 10 ? Math.round(quantity) : quantity >= 1 ? Math.round(quantity * 10) / 10 : Math.round(quantity * 100) / 100;
  return rounded.toLocaleString(locale, { maximumFractionDigits: 2 });
};

/**
 * An ingredient's line for `serves` servings of a recipe written for `written`: its amount scaled
 * and its name. At the servings it was written for, or when its amount or the recipe's servings are
 * not known, it is `raw` as written, asides and all.
 */
export const scaledLine = (ingredient: Ingredient, serves: number, written: number | undefined, locale?: string): { amount?: string; rest: string } => {
  if (ingredient.quantity === undefined || !written || serves === written) return { rest: ingredient.raw };
  const amount = formatQuantity(ingredient.quantity * serves / written, locale);
  return { amount: ingredient.unit ? `${amount} ${ingredient.unit}` : amount, rest: ingredient.name ?? '' };
};
