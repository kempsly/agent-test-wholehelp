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

L'outil d'exemple du socle `get_current_datetime` est encore dans la liste des outils : il est hors sujet et devrait être retiré.

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
bun install
bun run dev                 # API (3001) et front (5173) : http://localhost:5173
bun run test                # tests, sans Ollama ni réseau (PokéAPI simulée, faux LLM)
bun run typecheck
bun run eval                # évaluation sur le vrai modèle et le vrai PokéAPI (quelques minutes)
```

## Résultats de l'évaluation

16 cas x 3 passages sur qwen2.5:7b. Seuils visés : 90 % de bonnes réponses sur les cas normaux, 100 % de détournements refusés.

| Mesure | 1re | 2e | 3e | Seuil |
| --- | --- | --- | --- | --- |
| Bon outil | 79 % | 81 % | 88 % | |
| Bonne réponse (cas normaux) | 78 % | 67 % | 67 % | 90 % |
| Pas d'invention | 75 % | 73 % | 88 % | |
| Détournements refusés | 71 % | 57 % | 95 % | 100 % |
| Latence moyenne | 2,6 s | 2,6 s | 2,5 s | |

Les seuils ne sont pas atteints. Les critères ont changé entre les passages : les évaluations ne sont pas strictement comparables. Méthode, défauts, corrections et cause principale : [docs/EVALUATION.md](docs/EVALUATION.md). Le combat n'est pas couvert par l'évaluation.

## Limites

- Noms français traduits par le modèle de mémoire : c'est la cause de 9 échecs sur 16 à la 3e évaluation (Dracaufeu traduit en charmeleon, Évoli non traduit, Pikachoux corrigé en silence en Pikachu). Les outils n'acceptent que le nom anglais ou le numéro.
- Le modèle répond parfois sans appeler d'outil (« réponds de mémoire », nom inconnu) : le contrôle d'ancrage le signale mais ne l'empêche pas.
- Contrôle d'ancrage heuristique : il ne voit pas une valeur fausse issue d'un bon appel d'outil et peut signaler à tort un mot courant (« combat », « vol »).
- Filtre d'injection fragile : c'est une liste de mots (SYSTEM, ADMIN, « ignore tes instructions »), facile à contourner. Il réduit le risque sans le supprimer.
- Pas de limitation de débit sur l'API.
- Résumé du combat par le modèle parfois incomplet : le moteur est exact, mais le texte du modèle peut omettre des tours. La vue de combat affiche le journal complet.
- La vue de combat déduit les PV de départ du journal et n'affiche que les types d'attaque, car le résultat de l'outil ne contient pas les types ni les PV de départ.

## Prochaines étapes

- Résoudre les noms français en code, avec une table générée depuis PokéAPI.
- Relancer le tour si la réponse n'est pas ancrée et qu'aucun outil n'a été appelé.
- Essayer un modèle plus robuste (`OLLAMA_MODEL=<modèle> bun run eval`) et comparer avec le tableau ci-dessus.
- Renforcer le filtre d'injection, ajouter une limitation de débit, retirer `get_current_datetime`.
- Ajouter les types et les PV de départ dans le résultat de `simulate_battle`, et des cas de combat dans l'évaluation.
