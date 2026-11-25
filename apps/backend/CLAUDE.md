# Backend – Hono + agent

## Structure

- src/index.ts : routes (GET /api/health, GET /api/tools, POST /api/chat, POST /api/chat/stream). Ne pas modifier sans demande.
- src/agent.ts : boucle d'agent. Ne pas modifier sans demande.
- src/ollama.ts : client Ollama. Ne pas modifier sans demande.
- src/prompt.ts : prompt système, à adapter au sujet.
- src/tools/ : un fichier par outil (ou par groupe cohérent), liste centrale dans src/tools/index.ts.
- src/tools/data.ts : données fictives ou contenu de référence, séparés des outils.
- src/agent.test.ts : tests (faux LLM, aucun appel à Ollama).

## Créer un outil

1. defineTool() avec : name (snake_case, verbe d'abord), description en anglais (QUAND l'utiliser),
   schema Zod (avec .describe() sur chaque champ), execute.
2. Si la donnée est introuvable : renvoyer { error: "..." } explicite, jamais une valeur inventée.
3. Si l'outil modifie des données : paramètre confirm (boolean). Sans confirm: true → renvoyer un aperçu.
4. Ajouter l'outil à la liste dans src/tools/index.ts.
5. Ajouter 2 tests (cas normal + cas d'erreur).

## Prompt système (src/prompt.ts)

Sections à garder : Rôle, Règles d'utilisation des outils, Interdiction d'inventer, Clarification si ambigu,
Confirmation avant action, Langue et format des réponses. Rester court.
