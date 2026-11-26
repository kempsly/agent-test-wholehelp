// Key of the French name table: lowercase, no accents, single spaces, straight apostrophe.
// Shared by scripts/build-names.ts (which builds the table) and frenchNames.ts (which reads it).

export function normalizeFrenchName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
