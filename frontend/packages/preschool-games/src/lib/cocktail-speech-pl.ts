import type { CocktailRecipe, CocktailRecipeItem } from "./cocktail-game";

// Polish noun forms per ingredient (see COCKTAIL_INGREDIENTS' keys), for
// turning a recipe item into a natural spoken instruction — "dodaj 2 kiwi
// i jedną łyżkę miodu do shakera!" — instead of a generic "dodaj składniki"
// per this feature's own request. Case is accusative (the object of
// "dodaj"), which for count 2-3 is identical to nominative plural for
// every inanimate noun here, so `few` doubles as both; count 1 needs its
// own gendered "jeden/jedną/jedno" + the accusative singular noun ending
// (truskawka -> truskawkę, borówka -> borówkę, pomarańcza -> pomarańczę),
// spelled out as a word rather than the digit "1" — matching how the
// brief's own worked example wrote "одну ложку" (one spoon), not "1 ложку".
// Only 1-3 need covering (RECIPE_ITEM_COUNT_RANGE in cocktail-game.ts), so
// there's no 5+ genitive-plural form ("truskawek") to handle here.
const INGREDIENT_SPEECH_FORMS: Record<string, { one: string; few: string }> = {
  strawberry: { one: "jedną truskawkę", few: "truskawki" },
  banana: { one: "jeden banan", few: "banany" },
  blueberry: { one: "jedną borówkę", few: "borówki" },
  orange: { one: "jedną pomarańczę", few: "pomarańcze" },
  // Indeclinable loanword — same form at every count, so "few" and "one"'s
  // noun half are identical; only the "jedno" (neuter, how Polish treats
  // indeclinable borrowed nouns) versus a bare digit differs.
  kiwi: { one: "jedno kiwi", few: "kiwi" },
  // "syrup"'s own emoji/name is the honey pot (🍯) — spoken as "łyżka
  // miodu" (a spoon of honey), matching the brief's own example exactly,
  // not a literal "syrop" translation.
  syrup: { one: "jedną łyżkę miodu", few: "łyżki miodu" },
};

// Falls back to a plain "<count> <key>" for any ingredient key not in the
// table above (never happens with the real COCKTAIL_INGREDIENTS catalog,
// but keeps this from crashing if the catalog ever grows without this
// table being updated to match).
export function describeIngredientForSpeech(item: CocktailRecipeItem): string {
  const forms = INGREDIENT_SPEECH_FORMS[item.key];
  if (!forms) return `${item.count} ${item.key}`;
  return item.count === 1 ? forms.one : `${item.count} ${forms.few}`;
}

// "2 kiwi i jedną łyżkę miodu" — the two recipe items joined the way a
// spoken sentence would list them, for splicing into "Dodaj ... do
// shakera!".
export function describeRecipeForSpeech(recipe: CocktailRecipe): string {
  return recipe.map(describeIngredientForSpeech).join(" i ");
}
