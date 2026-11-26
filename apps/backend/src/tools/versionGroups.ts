// Version groups (games) from the oldest to the most recent, sorted by the "order" field of PokeAPI /version-group
// (read once on 2026-11-26). Used only to pick the most recent evolution conditions, never shown as game data.

export const VERSION_GROUP_ORDER = [
  "red-green-japan", "blue-japan", "red-blue", "yellow", "gold-silver", "crystal", "ruby-sapphire", "emerald",
  "colosseum", "xd", "firered-leafgreen", "diamond-pearl", "platinum", "heartgold-soulsilver", "black-white",
  "black-2-white-2", "x-y", "omega-ruby-alpha-sapphire", "sun-moon", "ultra-sun-ultra-moon",
  "lets-go-pikachu-lets-go-eevee", "sword-shield", "the-isle-of-armor", "the-crown-tundra",
  "brilliant-diamond-shining-pearl", "legends-arceus", "scarlet-violet", "the-teal-mask", "the-indigo-disk",
  "legends-za", "mega-dimension", "champions",
] as const;

/** Rank of a version group: an unknown name (a game added to PokeAPI later) counts as the most recent. */
export function versionRank(name: unknown): number {
  if (typeof name !== "string") return -1;
  const index = (VERSION_GROUP_ORDER as readonly string[]).indexOf(name);
  return index === -1 ? VERSION_GROUP_ORDER.length : index;
}
