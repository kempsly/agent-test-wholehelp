// Evolution conditions for the model: only the most recent game, and a short French sentence (condition_fr) built
// here, in code, from the PokeAPI fields. Item, move and location names come from PokeAPI in French; nothing is
// added that is not in the fields (no level without min_level).

import { z } from "zod";
import { frenchNameOf } from "./frenchNames";
import { PokeApiError, fetchPokeApi } from "./pokeapi";
import type { EvolutionCondition } from "./pokemon";
import { versionRank } from "./versionGroups";

/**
 * Legends: Arceus has its own evolution methods (Onix: an item instead of a trade holding Metal Coat): it is not used
 * as the most recent game, unless it is the only one that gives a condition.
 */
const SPECIAL_VERSION_GROUP = "legends-arceus";

/** The conditions of the most recent version group (several when that game has several ways, e.g. stone or place). */
export function latestConditions(conditions: EvolutionCondition[]): EvolutionCondition[] {
  const usual = conditions.filter((c) => c.version_group !== SPECIAL_VERSION_GROUP);
  const pool = usual.length > 0 ? usual : conditions;
  if (pool.length === 0) return [];
  const best = Math.max(...pool.map((c) => versionRank(c.version_group)));
  return pool.filter((c) => versionRank(c.version_group) === best);
}

// ---------- French names of items, moves and locations (PokeAPI) ----------

type NamedResource = "item" | "move" | "location";

/** Fields whose value is the name of an item, a move or a location. */
const RESOURCE_FIELDS: Record<string, NamedResource> = {
  item: "item",
  held_item: "item",
  known_move: "move",
  used_move: "move",
  location: "location",
};

const namesResponse = z.object({ names: z.array(z.object({ name: z.string(), language: z.object({ name: z.string() }) })) });

/** French name from PokeAPI, or the English name itself if there is none (never a translation by us). */
async function frenchResourceName(resource: NamedResource, name: string): Promise<string> {
  try {
    const parsed = namesResponse.safeParse(await fetchPokeApi(resource, name));
    return (parsed.success && parsed.data.names.find((n) => n.language.name === "fr")?.name) || name;
  } catch (error) {
    if (error instanceof PokeApiError && error.kind !== "unavailable") return name;
    throw error;
  }
}

export type FrenchNames = Map<string, string>;
const key = (resource: NamedResource, name: string) => `${resource}:${name}`;

/** French names of every item, move and location cited in the conditions (one cached request per name). */
export async function fetchFrenchNames(conditions: EvolutionCondition[]): Promise<FrenchNames> {
  const wanted = new Map<string, [NamedResource, string]>();
  for (const condition of conditions) {
    for (const [field, resource] of Object.entries(RESOURCE_FIELDS)) {
      const value = condition[field];
      if (typeof value === "string") wanted.set(key(resource, value), [resource, value]);
    }
  }
  const entries = await Promise.all(
    [...wanted].map(async ([k, [resource, name]]) => [k, await frenchResourceName(resource, name)] as const),
  );
  return new Map(entries);
}

// ---------- the sentence ----------

const TIME_OF_DAY: Record<string, string> = { day: "le jour", night: "la nuit", dusk: "au crépuscule" };
const PHYSICAL_STATS: Record<string, string> = {
  "1": "Attaque supérieure à la Défense",
  "0": "Attaque égale à la Défense",
  "-1": "Attaque inférieure à la Défense",
};
const GENDER: Record<string, string> = { female: "femelle", male: "mâle" };

/** One way to evolve, in French. "niveau" appears only with min_level. */
function describe(c: EvolutionCondition, names: FrenchNames): string {
  const fr = (resource: NamedResource, value: unknown) => names.get(key(resource, String(value))) ?? String(value);
  const pokemonFr = (value: unknown) => frenchNameOf(String(value)) ?? String(value);
  const parts: string[] = [];

  if (c.trigger === "use-item") parts.push(c.item !== undefined ? fr("item", c.item) : "objet non précisé");
  else if (c.trigger === "trade") parts.push("échange");
  else if (c.trigger !== undefined && c.trigger !== "level-up") parts.push(`déclencheur particulier : ${c.trigger}`);

  if (c.min_level !== undefined) parts.push(`niveau ${c.min_level}`);
  if (c.gender !== undefined) parts.push(GENDER[String(c.gender)] ?? `sexe ${c.gender}`);
  if (c.held_item !== undefined) parts.push(`en tenant ${fr("item", c.held_item)}`);
  if (c.trade_species !== undefined) parts.push(`contre ${pokemonFr(c.trade_species)}`);
  if (c.min_happiness !== undefined) parts.push("amitié élevée");
  if (c.min_affection !== undefined) parts.push("affection élevée");
  if (c.min_beauty !== undefined) parts.push("beauté élevée");
  if (c.known_move !== undefined) parts.push(`en connaissant l'attaque ${fr("move", c.known_move)}`);
  if (c.known_move_type_fr !== undefined) parts.push(`en connaissant une attaque de type ${c.known_move_type_fr}`);
  if (c.used_move !== undefined) {
    parts.push(`en utilisant l'attaque ${fr("move", c.used_move)}${c.min_move_count !== undefined ? ` ${c.min_move_count} fois` : ""}`);
  }
  if (c.time_of_day !== undefined) parts.push(TIME_OF_DAY[String(c.time_of_day)] ?? String(c.time_of_day));
  if (c.location !== undefined) parts.push(`${c.near_special_rock ? "près d'un rocher spécial à " : "à "}${fr("location", c.location)}`);
  else if (c.near_special_rock) parts.push("près d'un rocher spécial");
  if (c.needs_overworld_rain) parts.push("sous la pluie");
  if (c.turn_upside_down) parts.push("console tenue à l'envers");
  if (c.relative_physical_stats !== undefined) parts.push(PHYSICAL_STATS[String(c.relative_physical_stats)] ?? `statistiques : ${c.relative_physical_stats}`);
  if (c.party_species !== undefined) parts.push(`avec ${pokemonFr(c.party_species)} dans l'équipe`);
  if (c.party_type_fr !== undefined) parts.push(`avec un Pokémon de type ${c.party_type_fr} dans l'équipe`);
  if (c.min_steps !== undefined) parts.push(`après ${c.min_steps} pas`);
  if (c.min_damage_taken !== undefined) parts.push(`après avoir perdu au moins ${c.min_damage_taken} PV`);
  if (c.needs_multiplayer) parts.push("en multijoueur");
  if (c.region !== undefined) parts.push(`dans la région ${c.region}`);
  if (Array.isArray(c.allowed_natures)) parts.push(`avec la nature ${c.allowed_natures.join(", ")}`);

  if (parts.length === 0) return c.trigger === "level-up" ? "gain d'expérience, sans autre condition précisée" : "condition non précisée";
  return parts.join(", ");
}

/** The sentence for one evolution: its ways to evolve (already filtered on one game), without duplicates, joined by "ou". */
export function conditionFr(conditions: EvolutionCondition[], names: FrenchNames): string {
  if (conditions.length === 0) return "condition non précisée";
  return [...new Set(conditions.map((c) => describe(c, names)))].join(" ou ");
}
