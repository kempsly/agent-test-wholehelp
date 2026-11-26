// Closed list of the 18 types and their official French names (labels only, no game data).
// Used by the tools to give both names, and by the grounding check to recognize a type cited in French.

export const POKEMON_TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];

export const TYPE_FR: Record<PokemonType, string> = {
  normal: "Normal",
  fire: "Feu",
  water: "Eau",
  electric: "Électrik",
  grass: "Plante",
  ice: "Glace",
  fighting: "Combat",
  poison: "Poison",
  ground: "Sol",
  flying: "Vol",
  psychic: "Psy",
  bug: "Insecte",
  rock: "Roche",
  ghost: "Spectre",
  dragon: "Dragon",
  dark: "Ténèbres",
  steel: "Acier",
  fairy: "Fée",
};

/** French name of a type; an unknown type (never expected) is returned as is, never invented. */
export function typeFr(type: string): string {
  return TYPE_FR[type as PokemonType] ?? type;
}
