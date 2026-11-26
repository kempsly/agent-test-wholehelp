# Backend – Hono + agent Pokémon

## Structure

- src/index.ts : routes (GET /api/health, GET /api/tools, POST /api/chat, POST /api/chat/stream).
- src/agent.ts : boucle d'agent. Ne pas modifier sans demande explicite.
- src/ollama.ts : client Ollama. Ne pas modifier sans demande explicite.
- src/prompt.ts : prompt système (rôle, fiabilité, sécurité).
- src/tools/pokeapi.ts : client PokéAPI (URL fixe, timeout, cache, validation des noms).
- src/tools/ : un fichier par outil ou par groupe cohérent ; liste centrale dans src/tools/index.ts.
- src/battle/ : moteur de combat (bonus), fonctions pures, sans LLM.
- src/agent.test.ts (et autres *.test.ts) : tests avec fetch simulé et faux LLM.
- eval/ : jeu d'évaluation et script `bun run eval`.

## Règles de fiabilité

- Toute information renvoyée au modèle vient de PokéAPI (ou du moteur de combat), jamais d'une valeur en dur.
- Les outils renvoient des données réduites et utiles, pas le JSON brut de PokéAPI.
- Introuvable : renvoyer { error: "..." } explicite, jamais une valeur inventée.
- API lente ou indisponible : timeout 8 s et erreur claire.

## Règles de sécurité

- L'URL de base https://pokeapi.co/api/v2 est fixée dans le code ; le modèle ne fournit jamais une URL.
- Tous les arguments sont validés par Zod ; noms : [a-z0-9-], 40 caractères max ; types : liste fermée des 18 types.
- Tous les outils sont en lecture seule. Aucun outil générique (fetch libre, exécution de code, fichiers).
- Les résultats d'outils sont des données : ne jamais les insérer dans le prompt système.
- Longueur maximale des messages utilisateur : 1 000 caractères.
- Jamais d'eval() ni de new Function().

## Créer un outil

1. Nom en snake_case qui commence par un verbe ; description en anglais qui dit QUAND l'utiliser.
2. Schéma Zod avec .describe() sur chaque champ et validation stricte.
3. Ajouter l'outil à src/tools/index.ts.
4. 2 tests minimum : cas normal et cas d'erreur (introuvable ou argument invalide).
