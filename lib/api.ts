/**
 * What the recipe commands answer under `JSON_OUTPUT=1`, for the commands, the pages and other
 * modules alike.
 */
import type { NodeOwnership } from '@ein/api';

/** One line of a recipe's ingredients: as written, and its amount, unit and name as far as they were read. */
export type Ingredient = {
  /** The section it is in (`Sauce`); consecutive lines of one section are shown under its heading. */
  group?: string;
  /** The line as written. */
  raw: string;
  quantity?: number;
  unit?: string;
  name?: string;
};

/** One step of a recipe's method. */
export type RecipeStep = { group?: string; text: string };

/** A recipe as a list shows it, as `recipe-list` answers it. */
export type RecipeCard = {
  path: string;
  title: string;
  description?: string;
  /** How many servings the amounts are written for. */
  serves?: number;
  totalMinutes?: number;
  /** 1 easy, 2 medium, 3 demanding. */
  difficulty?: number;
  /** 1 to 5. */
  rating?: number;
  categories: string[];
  /** The language the recipe is written in, as a BCP 47 tag (`sv`); the interface around it is the reader's. */
  lang?: string;
  /** The site it was taken from, by its host name. */
  site?: string;
};

/** A whole recipe, as `recipe-show`, `recipe-create` and `recipe-set` answer it. */
export type Recipe = RecipeCard & {
  ingredients: Ingredient[];
  steps: RecipeStep[];
  /** What it holds that someone may not eat, as the source said it. */
  allergyInfo?: string;
  /** The address of the page it was taken from. */
  source?: string;
  /** Its pictures' paths, in name order. */
  pictures: string[];
  /** Who may change it. */
  ownership: NodeOwnership;
};

/** `recipe-list`: a page of recipes, and the `--after` that reads the next page when there is one. */
export type RecipePage = { recipes: RecipeCard[]; next?: string };

/** `recipe-categories`: a category and how many recipes are in it. */
export type RecipeCategory = { name: string; count: number };
