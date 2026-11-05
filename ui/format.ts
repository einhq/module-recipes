/** How the recipe pages say a recipe's facts. */

/** A time as a cook says it: `40 min`, `1 h 30 min`. */
export const minutesLabel = (minutes: number): string => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;

export const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Demanding' };

/** The last segment of a recipe's path: what its page's route names it by. */
export const recipeRoute = (path: string): string => `/recipes/${encodeURIComponent(path.split('/').pop()!)}`;
