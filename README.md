# Assistant Pokémon

Un assistant conversationnel en français qui répond aux questions sur les Pokémon à partir de l'API publique PokéAPI (https://pokeapi.co/api/v2/, sans clé). Priorités, dans l'ordre : fiabilité (chaque information vient d'un outil, jamais de la mémoire du modèle), sécurité (l'agent ne doit pas pouvoir être détourné), puis un bonus de combat calculé en code.

## Architecture

- Un seul agent en lecture seule : le modèle (Ollama en local, qwen2.5:7b, température 0,2) choisit des outils, le code les exécute et renvoie les résultats au modèle. Appel direct de l'API Ollama, sans SDK ni framework d'agent.
- Les outils sont branchés sur PokéAPI (URL fixée dans le code, timeout de 8 s, cache en mémoire, noms validés).
- Le combat est calculé par un moteur déterministe en code (`apps/backend/src/battle/engine.ts`), jamais par le modèle.
- L'API est sans état : le front garde l'historique. Les étapes de l'agent arrivent au front en Server-Sent Events.

```
apps/backend    API Bun + Hono (port 3001) : agent, outils, moteur de combat, évaluation
apps/frontend   Front React + Vite (port 5173) : chat, appels d'outils, badge d'ancrage, vue de combat
packages/shared Types partagés entre l'API et le front
docs/           SUJET, PLAN, DECISIONS, EVALUATION
```

## Les outils

| Outil | Rôle |
| --- | --- |
| `get_pokemon` | Fiche d'un Pokémon : noms, types, statistiques, talents, taille, poids, description française |
| `get_type_matchups` | Faiblesses, résistances et immunités d'un Pokémon ou de 1 à 2 types ; multiplicateurs calculés en code |
| `get_evolution_chain` | Chaîne d'évolution par étapes, avec les branches et les conditions présentes dans PokéAPI |
| `simulate_battle` | Combat simulé tour par tour entre deux Pokémon (règles simplifiées), vainqueur et journal |

API : corps de 32 Ko maximum (413), Content-Type application/json obligatoire (415), 20 requêtes par minute et par IP, en mémoire (429).

## Garanties de fiabilité

- Toute information vient de PokéAPI via un outil. Introuvable ou API indisponible : l'outil renvoie une erreur claire, le modèle ne doit rien inventer.
- Les outils renvoient des données réduites. Les multiplicateurs de types (x4, x0,25, x0) et le combat sont calculés en code.
- Les noms de types français viennent d'une table fixe des 18 types. `description_fr` est limitée à 300 caractères, sans repli sur une autre langue.
- Contrôle d'ancrage après chaque réponse : les nombres et les noms de types cités doivent apparaître dans les résultats des outils du tour. Le front affiche « vérifié » ou « à vérifier ».

## Garanties de sécurité

- Liste fermée d'outils, tous en lecture seule. Aucun outil générique (pas de fetch libre, d'exécution de code ni de fichiers). Pas d'`eval()`.
- Arguments validés par Zod : noms limités à `[a-z0-9-]` sur 40 caractères (une chaîne comme `../users` est rejetée), types dans la liste des 18.
- Requête validée : rôles `user` et `assistant` uniquement, 30 messages au plus, 1 000 caractères par message utilisateur, 20 000 au total.
- Messages utilisateur encadrés par `<user_message>` comme donnée non fiable, avec un filtre d'injection (voir les limites). Le prompt impose le rôle, le refus du hors sujet, la non-divulgation des instructions et le traitement des résultats d'outils comme des données.
- Le front affiche le texte de l'agent et les résultats d'outils en texte simple, jamais en HTML.

## Lancement

```bash
ollama pull qwen2.5:7b      # une seule fois (Ollama doit tourner)
cp .env.example .env
openssl rand -hex 32        # copier la valeur dans HISTORY_SECRET (.env), obligatoire
bun install
bun run dev                 # API (3001) et front (5173) : http://localhost:5173
bun run test                # tests, sans Ollama ni réseau (PokéAPI simulée, faux LLM)
bun run typecheck
bun run eval                # évaluation sur le vrai modèle et le vrai PokéAPI (quelques minutes)
```

Sans `HISTORY_SECRET` valide (32 caractères minimum, pas la valeur d'exemple), l'API refuse de démarrer.

## Résultats de l'évaluation

qwen2.5:7b, 3 passages par cas. Seuils visés : 90 % de bonnes réponses sur les cas normaux, 100 % de détournements refusés.

| Mesure | 1re | 2e | 3e | Après test | Seuil |
| --- | --- | --- | --- | --- | --- |
| Cas x passages | 16 x 3 | 16 x 3 | 16 x 3 | 22 x 3 | |
| Bon outil | 79 % | 81 % | 88 % | 95 % | |
| Bonne réponse (cas normaux) | 78 % | 67 % | 67 % | 100 % | 90 % |
| Pas d'invention | 75 % | 73 % | 88 % | 88 % | |
| Détournements refusés | 71 % | 57 % | 95 % | 100 % | 100 % |
| Latence moyenne | 2,6 s | 2,6 s | 2,5 s | 7,8 s (5,4 s hors conversation longue) | |

Seuils atteints seulement après le test. Les 6 cas ajoutés : 4 fuites du prompt, Évoli avec conditions, une conversation longue de 10 questions (un outil à chaque question, 3 passages sur 3). Les 8 échecs restants sur 66 portent sur « bon outil » ou « pas d'invention », aucun sur la bonne réponse : « réponds de mémoire » (3/3, réponse juste mais sans outil) et deux cas de fuite du prompt dont le refus est marqué « à vérifier » à tort. Les critères et le jeu de cas ont changé entre les passages : les colonnes ne sont pas strictement comparables. Détails : [docs/EVALUATION.md](docs/EVALUATION.md). Le combat n'est pas couvert.

## Améliorations après le test

- Contexte tronqué : Ollama chargeait le modèle avec 4 096 tokens. Au-delà d'environ 3 300 tokens, le prompt système et les outils étaient jetés (journal Ollama) ou la génération s'emballait (erreur 500). Correction : `num_ctx` 8192 et `num_predict` 1024.
- Fenêtre d'historique : le modèle ne voit que la question et les 2 échanges précédents (`recentHistory`, partagé par le front, l'API et l'évaluation). Supprime aussi l'erreur 400 des longues conversations.
- Relance sans historique : si la 1re étape répond sans outil en citant un Pokémon, un type ou un chiffre, elle est relancée une fois avec le prompt système, la question, le Pokémon dont on parle et un rappel. Toujours sans outil : réponse marquée « à vérifier ».
- Liste d'évolutions rédigée en code : `get_evolution_chain` produit `summary_fr`, ajouté tel quel par le backend ; le modèle n'écrit qu'une phrase d'introduction.
- Contrôle par paire : chaque évolution citée doit l'être avec sa propre condition, sinon « à vérifier ».
- Nettoyage de sortie : Markdown et caractères chinois retirés ; un prompt recopié est remplacé par un refus.
- Limites d'API : corps de 32 Ko (413), `Content-Type: application/json` (415), 20 requêtes par minute et par IP (429).
- Signature de l'historique : chaque réponse est signée (HMAC-SHA256 avec `HISTORY_SECRET`, liée à la question qui la précède). Une réponse d'assistant inventée ou modifiée par le client est refusée (400).
- Tokens affichés à côté de la latence. Aussi : noms français résolus en code (`names-fr.json`), `get_current_datetime` retiré.

Rejeu de 16 questions enchaînées, envoyées comme le front (1 passage) :

| | Avant (code d'origine) | Après |
| --- | --- | --- |
| Questions avec outil | 2 sur les 8 premières, puis blocage à la question 9 | 16 / 16 |
| Réponses « vérifié » | non mesuré | 16 / 16 |
| Erreurs | 500 à la question 9 (après 4 min), 400 en conversation longue | 0 |
| Tokens question 1 / question 16 | 2 187 / 4 079 sur 4 096, tronqué | 2 154 / 2 347 |
| Latence moyenne par question | 30,4 s (2,3 s sans le blocage) | 7,9 s |

Avant : temps du modèle lu dans le journal d'Ollama. Après : latence réelle, outils et relances compris (8 relances sur 16 questions). Un seul passage : le modèle n'est pas déterministe.

## Limites

- Latence plus haute : la relance ajoute un appel au modèle (environ 5 à 8 s par question contre 2,5 s avant).
- Badge « vérifié » = aucun écart détecté par une heuristique, pas preuve que la réponse est juste. Il ne voit pas une valeur fausse issue d'un bon appel d'outil et peut signaler à tort un mot courant (« combat », « vol »).
- Réponses « de mémoire » : signalées « à vérifier », pas bloquées.
- Refus d'une fuite du prompt parfois marqué « à vérifier » : la relance est décidée sur le texte brut du modèle, avant le nettoyage de sortie.
- Filtre d'injection fragile (liste de formulations, facile à contourner) ; rate limit en mémoire, perdu au redémarrage.
- Combat : le résumé du modèle peut omettre des tours (la vue affiche le journal complet) ; la vue déduit les PV de départ du journal.

## Prochaines étapes

- Décider la relance après le nettoyage de sortie, et ne pas marquer « à vérifier » une réponse qui ne cite ni nombre, ni type, ni Pokémon.
- Essayer un modèle plus robuste (`OLLAMA_MODEL=<modèle> bun run eval`).
- Ajouter les types et les PV de départ dans le résultat de `simulate_battle`, et des cas de combat dans l'évaluation.
