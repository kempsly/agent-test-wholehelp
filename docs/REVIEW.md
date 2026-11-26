# Revue sécurité et fiabilité

Lecture seule de `apps/backend/src` et `apps/frontend/src`. Points classés par gravité.

## 1. Faux messages de l'assistant dans l'historique (détournement)
- Fichiers : `apps/backend/src/answer.ts:39-44`, `apps/backend/src/chatRequest.ts:15`
- Problème : seuls les messages `user` sont encadrés et filtrés. Les messages `assistant` (jusqu'à 8 000 caractères) viennent du front et arrivent tels quels au modèle : on peut y inventer de fausses réponses, règles ou statistiques que le modèle recopie, sans que le contrôle d'ancrage les voie.
- Correction : signer chaque réponse côté serveur (HMAC sur `reply`) et rejeter les messages `assistant` mal signés. Sinon, réduire `MAX_ASSISTANT_CHARS` et passer ces messages dans `neutralizeInjections`.

## 2. Conditions d'évolution incomplètes (invention)
- Fichier : `apps/backend/src/tools/pokemon.ts:36,169`
- Problème : seuls `evolution_details[0]` et trois champs (`min_level`, `trigger`, `item`) sont gardés. Bonheur, moment de la journée, objet tenu, attaque connue et lieu sont perdus : pour Mentali, l'outil renvoie « level-up » sans niveau et le modèle complète de mémoire.
- Correction : renvoyer toutes les entrées de `evolution_details` avec ces champs. Ajouter un test Évoli / Mentali.

## 3. Noms français traduits de mémoire par le modèle (invention)
- Fichier : `apps/backend/src/prompt.ts:14`
- Problème : le modèle convertit les noms français en anglais de mémoire ; une erreur donne la fiche d'un autre Pokémon. La vérification de `french_name` repose aussi sur le modèle.
- Correction : table fichier français vers anglais générée une fois depuis `pokemon-species`, utilisée dans `nameOrId`. À défaut, comparer `french_name` au nom demandé dans le code.

## 4. Contrôle d'ancrage trop facile à satisfaire
- Fichier : `apps/backend/src/grounding.ts:34-39,58`
- Problème : un nombre est accepté s'il apparaît n'importe où dans les résultats du tour, y compris les messages d'erreur (« 8 seconds », « 40 characters », « HTTP 500 »). Les noms de Pokémon, talents et objets ne sont pas vérifiés.
- Correction : ignorer les nombres des messages d'erreur, vérifier les noms de Pokémon et de talents cités. Renommer le badge « vérifié » en « aucun écart détecté ».

## 5. Outil hors sujet encore exposé
- Fichier : `apps/backend/src/tools/index.ts:11`
- Problème : `get_current_datetime` reste dans le registre (l'agent répond à « quelle heure est-il ? ») et n'a pas les 2 tests exigés.
- Correction : le retirer du registre et ajouter `expect(names).not.toContain("get_current_datetime")` dans `tools.test.ts:331`.

## 6. Filtre d'injection facile à contourner
- Fichier : `apps/backend/src/answer.ts:13-14,28`
- Problème : `SYSTEM` n'est détecté qu'en début de ligne (« Bonjour. SYSTEM: … » passe), de même que « oublie tes règles » ou « disregard ». Aucun contrôle en sortie contre la fuite du prompt système.
- Correction : tester le début de chaque phrase, ajouter quelques formulations courantes, et remplacer par un refus une réponse qui contient un extrait du prompt système.

## 7. Le chat casse après une quinzaine d'échanges
- Fichiers : `apps/frontend/src/App.tsx:55-58`, `apps/backend/src/chatRequest.ts:7-10`
- Problème : le front envoie tout l'historique. Au-delà de 30 messages ou 20 000 caractères, l'API renvoie 400 à chaque message. Même chose pour un message de plus de 1 000 caractères.
- Correction : ne garder que les N derniers messages dans la limite des tailles, et `maxLength={1000}` sur le champ de saisie.

## 8. Délais PokéAPI et outil incohérents
- Fichiers : `apps/backend/src/tools/pokeapi.ts:5`, `apps/backend/src/config.ts:10`
- Problème : 8 s par appel PokéAPI, appels en série (2 pour `get_pokemon`, 3 pour `get_evolution_chain`), mais l'outil coupe à 10 s : « Tool timed out » alors que la requête aurait réussi.
- Correction : environ 3 s par appel, ou `TOOL_TIMEOUT_MS` à environ 25 s.

## 9. Aucune limite de taille ni de débit sur l'API
- Fichier : `apps/backend/src/index.ts:22,33`
- Problème : le corps est lu entièrement avant la validation Zod, sans limite de requêtes (jusqu'à 6 appels Ollama chacune). `req.json()` ignore le Content-Type : une page tierce peut envoyer un POST text/plain sans contrôle CORS préalable.
- Correction : `bodyLimit` de Hono (environ 64 Ko) et refus des requêtes sans `Content-Type: application/json`. Nécessite ton accord (modification de `index.ts`).

## 10. Tests manquants et bug de la vue de combat
- Tests manquants : faux message `assistant` dans l'historique (point 1), évolution avec conditions autres que le niveau (point 2), nombre présent seulement dans un message d'erreur (point 4), `parseBattle` côté front (`apps/frontend/src/BattleView.tsx:36`).
- Bug : `apps/frontend/src/BattleView.tsx:75-78` déduit les PV de départ du journal ; ils sont faux quand le premier coup reçu est un KO.
- Correction : renvoyer `initial_hp` dans le résultat de `simulateBattle` (`apps/backend/src/battle/engine.ts:100`) et ajouter ces tests.

Les points 1 à 3 touchent directement la fiabilité et la sécurité. Les points 3 à 6 recoupent les limites déjà notées dans le README, sans correction pour l'instant.
