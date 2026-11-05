/** Ingredient lines read into amounts, written back, scaled and grouped. */
import { assertEquals } from '@std/assert';
import { formatQuantity, ingredientsFromText, linesToText, parseIngredient, scaledLine, sectionsOf, stepsFromText } from '@recipes/ingredients';

Deno.test('an amount, a unit and a name are read off the front of a line', () => {
  assertEquals(parseIngredient('2 dl mjölk'), { raw: '2 dl mjölk', quantity: 2, unit: 'dl', name: 'mjölk' });
  assertEquals(parseIngredient('1,5 msk socker'), { raw: '1,5 msk socker', quantity: 1.5, unit: 'msk', name: 'socker' });
  assertEquals(parseIngredient('1 1/2 tsk salt').quantity, 1.5);
  assertEquals(parseIngredient('½ citron'), { raw: '½ citron', quantity: 0.5, name: 'citron' });
  assertEquals(parseIngredient('1½ cups flour'), { raw: '1½ cups flour', quantity: 1.5, unit: 'cups', name: 'flour' });
  assertEquals(parseIngredient('4 äpplen'), { raw: '4 äpplen', quantity: 4, name: 'äpplen' });
});

Deno.test('asides, alternatives and an approximate amount are read past, and kept in raw', () => {
  assertEquals(parseIngredient('ca 300 g potatis (fast)'), { raw: 'ca 300 g potatis (fast)', quantity: 300, unit: 'g', name: 'potatis' });
  assertEquals(parseIngredient('2 dl grädde eller crème fraiche'), { raw: '2 dl grädde eller crème fraiche', quantity: 2, unit: 'dl', name: 'grädde' });
  assertEquals(parseIngredient('2-3 morötter'), { raw: '2-3 morötter', quantity: 2, name: 'morötter' });
});

Deno.test('a line with no amount is only its name', () => {
  assertEquals(parseIngredient('salt och peppar'), { raw: 'salt och peppar', name: 'salt och peppar' });
});

Deno.test('a # line names the section of the lines after it, and the text comes back the same', () => {
  const text = '4 äpplen\n2 dl socker\n\n# Smet\n100 g smör\n1 ägg';
  const ingredients = ingredientsFromText(text);
  assertEquals(ingredients.map((each) => each.group), [undefined, undefined, 'Smet', 'Smet']);
  assertEquals(linesToText(ingredients), text);
  assertEquals(sectionsOf(ingredients).map((section) => [section.group, section.items.length]), [[undefined, 2], ['Smet', 2]]);
});

Deno.test('a step loses its number, which the page gives it', () => {
  assertEquals(stepsFromText('1. Skala äpplena.\n2) Grädda i 40 minuter.'), [{ text: 'Skala äpplena.' }, { text: 'Grädda i 40 minuter.' }]);
});

Deno.test('amounts scale to the servings asked, rounded as a cook reads them', () => {
  const milk = parseIngredient('2 dl mjölk');
  assertEquals(scaledLine(milk, 6, 4, 'sv'), { amount: '3 dl', rest: 'mjölk' });
  assertEquals(scaledLine(parseIngredient('1 msk smör'), 3, 4, 'sv'), { amount: '0,75 msk', rest: 'smör' });
  assertEquals(scaledLine(milk, 4, 4, 'sv'), { rest: '2 dl mjölk' });
  assertEquals(scaledLine(parseIngredient('salt'), 8, 4, 'sv'), { rest: 'salt' });
  assertEquals(scaledLine(milk, 8, undefined, 'sv'), { rest: '2 dl mjölk' });
  assertEquals([formatQuantity(12.4, 'en'), formatQuantity(2.25, 'en'), formatQuantity(0.333, 'en')], ['12', '2.3', '0.33']);
});
