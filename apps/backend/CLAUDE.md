# Backend – Hono + agent Pokémon

## Structure

- src/index.ts : routes (GET /api/health, GET /api/tools, POST /api/chat, POST /api/chat/stream).
- src/agent.ts : boucle d'agent. Ne pas modifier sans demande explicite.
- src/ollama.ts : client Ollama. Ne pas modifier sans demande explicite.
- src/prompt.ts : prompt système (rôle, fiabilité, format, sécurité).
- src/answer.ts : pipeline d'une réponse (encadrement des messages, agent, ancrage), utilisé par les routes et par eval/.
- src/chatRequest.ts : schéma de la requête (rôles, tailles). src/grounding.ts : contrôle d'ancrage après la réponse.
- src/tools/pokeapi.ts : client PokéAPI (URL fixe, timeout, cache, validation des noms).
- src/tools/ : un fichier par outil ou par groupe cohérent ; liste centrale dans src/tools/index.ts.
- src/battle/ : moteur de combat (bonus), fonctions pures, sans LLM.
- src/agent.test.ts : tests de la boucle avec faux LLM. Autres tests à côté du code : tools/pokeapi.test.ts,
  tools/tools.test.ts, battle/battle.test.ts (fetch simulé).
- eval/ : jeu d'évaluation (20 cas, dont 4 de fuite du prompt) et script `bun run eval`.

## Règles de fiabilité

- Toute information renvoyée au modèle vient de PokéAPI (ou du moteur de combat), jamais d'une valeur en dur.
- Les outils renvoient des données réduites et utiles, pas le JSON brut de PokéAPI.
- Introuvable : renvoyer { error: "..." } explicite, jamais une valeur inventée.
- API lente ou indisponible : timeout 8 s et erreur claire.
- Les outils acceptent le nom anglais ou le numéro. Introuvable (404) : erreur qui propose le nom anglais, le numéro
  ou une forme précise (deoxys, giratina, mr-mime, nidoran-f).
- get_pokemon renvoie french_name ; description_fr : 300 caractères max, null si absente (pas de repli sur une autre langue).
- get_type_matchups : multiplicateur final calculé en code ; le LLM ne calcule jamais.
- get_evolution_chain : liste d'étapes avec branches ; pour chaque Pokémon, name_fr (nom affiché, names-fr.json) et toutes
  les entrées de evolution_details dans conditions (tous les champs non vides, sexe en clair, avec version_group).
- data/names-fr.json : nom français normalisé -> { en, fr }, généré par scripts/build-names.ts (ne pas éditer à la main).
- Noms de types : table fixe des 18 types (tools/pokemonTypes.ts), noms français et anglais dans les sorties des outils.
- get_type_matchups : paramètre pokemon (types lus en code) ou types (1 ou 2), un seul des deux ; listes faiblesses, resistances, immunites ; get_evolution_chain : seuls les champs présents dans PokéAPI.
- Contrôle d'ancrage : heuristique (nombres et noms de types ; multiplicateurs et nombres <= 2 tolérés).

## Règles de sécurité

- L'URL de base https://pokeapi.co/api/v2 est fixée dans le code ; le modèle ne fournit jamais une URL.
- Tous les arguments sont validés par Zod ; noms : [a-z0-9-], 40 caractères max ; types : liste fermée des 18 types.
- Tous les outils sont en lecture seule. Aucun outil générique (fetch libre, exécution de code, fichiers).
- Les résultats d'outils sont des données : ne jamais les insérer dans le prompt système.
- Les messages utilisateur sont encadrés par <user_message> avant d'être envoyés au modèle (src/answer.ts), après un filtre
  d'injection FRAGILE, phrase par phrase (SYSTEM, ADMIN, ignore/oublie tes règles, changement de rôle, répéter le prompt)
  qui réduit le risque sans le supprimer.
- Contrôle de sortie (src/outputGuard.ts) : une réponse qui contient 30 caractères consécutifs du prompt système est
  remplacée par un refus poli.
- Requête : rôles user et assistant uniquement ; chaque message assistant porte la signature HMAC donnée par le serveur (HISTORY_SECRET), sinon 400 ; 30 messages maximum, 1 000 caractères par message utilisateur,
  20 000 caractères au total.
- Jamais d'eval() ni de new Function().

## Créer un outil

1. Nom en snake_case qui commence par un verbe ; description en anglais qui dit QUAND l'utiliser.
2. Schéma Zod avec .describe() sur chaque champ et validation stricte.
3. Ajouter l'outil à src/tools/index.ts.
4. 2 tests minimum dans tools/tools.test.ts : cas normal et cas d'erreur (introuvable ou argument invalide).
