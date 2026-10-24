// The manual, built by scripts/build_kb.py. Imported (not read from disk) so it always ships with the function.
import bundle from "../../../kb/bundle.json";
import type { ButtonId } from "../buttons";

export interface Recipe {
  code: string;
  name: string;
  hi: string;
  aka: string[];
  category: string;
  /** Panel button as printed, e.g. "Charcoal/Indian Cuisine". */
  button: string;
  /** Group number shown on the display after pressing the button; null for Healthy Heart. */
  categoryNo: string | null;
  page: number | null;
  weight?: string;
  utensil?: string;
  md: string;
}

const kb = bundle as unknown as { core: string; catalog: string; recipes: Recipe[] };

export const CORE = kb.core;
export const CATALOG = kb.catalog;
export const RECIPES = kb.recipes;

const BUTTON_IDS: Record<string, ButtonId> = {
  "Charcoal/Indian Cuisine": "CHARCOAL",
  "Healthy Heart": "HEALTHY_HEART",
  "Indian Roti Basket/Ghee": "ROTI_GHEE",
  "Air Fry/Low Calorie": "AIR_FRY",
  "Kids'/Dairy Delight": "KIDS_DAIRY",
};

export const buttonIdOf = (r: Recipe): ButtonId => BUTTON_IDS[r.button];

export function findMenu(button: ButtonId, code: string): Recipe | undefined {
  return RECIPES.find((r) => buttonIdOf(r) === button && r.code === code.trim());
}
