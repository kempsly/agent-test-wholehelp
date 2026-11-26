# Agent conversationnel – test technique

## Business Requirements

Le sujet complet est dans docs/SUJET.md. Résumé :

- Thème : un assistant Pokémon qui répond aux questions des utilisateurs à partir de l'API publique PokéAPI
  (https://pokeapi.co/api/v2/, sans clé).
- Utilisateurs : des personnes qui veulent des informations fiables sur les Pokémon, en français.
- L'agent fait UNIQUEMENT de la lecture : aucune écriture, aucune action.
- Besoins : fiche d'un Pokémon, forces et faiblesses des types, évolutions, comparaison de Pokémon ;
  en bonus si le temps le permet : simulation de combat.
- Priorités, dans l'ordre :
  1. FIABILITÉ : chaque information vient de PokéAPI via un outil, jamais de la mémoire du modèle ;
     introuvable → le dire, sans inventer.
  2. SÉCURITÉ : l'agent ne peut pas être détourné (injection de prompt, changement de rôle,
     hors sujet, appel d'outils non prévus).
  3. BONUS : expérience de combat, calculée par un moteur déterministe en code, jamais par le LLM.

## Limitations

- Durée de réalisation : 1 h 30. Priorité à une démo qui fonctionne, pas à l'exhaustivité.
- Le LLM tourne en local avec Ollama : aucune clé d'API payante.
- Pas d'authentification, pas de base de données : les données sont en mémoire ou dans des fichiers.
- L'historique de conversation est gardé par le front ; l'API est sans état.

## Technical Decisions

- Monorepo Turborepo, runtime et gestionnaire de paquets : Bun.
- Backend : apps/backend, TypeScript + Hono, port 3001.
- Frontend : apps/frontend, React + Vite, port 5173 (proxy /api vers l'API).
- Types partagés API / front : packages/shared.
- LLM : Ollama en local, modèle qwen2.5:7b (bon appel d'outils, rapide sur Mac M4), température 0,2.
- Appel direct de l'API Ollama /api/chat, sans SDK ni framework d'agent.
- Validation des arguments des outils avec Zod.
- Streaming des étapes de l'agent vers le front en Server-Sent Events.

## Starting Point

Un socle fonctionnel existe déjà :
- apps/backend/src/agent.ts : boucle d'agent (LLM → outils → LLM) avec limite d'itérations, timeout par outil,
  validation Zod, erreurs renvoyées au modèle.
- apps/backend/src/tools/ : outils d'exemple (date, calculatrice, recherche dans une base de connaissances).
- apps/backend/src/prompt.ts : prompt système à adapter au sujet.
- apps/frontend/src/App.tsx : interface de chat qui affiche les appels d'outils.
- apps/backend/src/agent.test.ts : tests de la boucle avec un faux LLM.
Lancer : `bun run dev`. Tester : `bun run test`. Vérifier les types : `bun run typecheck`.

## Agent Design

- Par défaut : un seul agent avec 3 à 5 outils. Multi-agents seulement si le sujet impose des rôles
  aux instructions contradictoires (routeur) ou une étape de vérification séparée (relecteur).
  Toute décision d'architecture doit être notée dans docs/DECISIONS.md.
- Un outil = une action claire, nom en snake_case qui commence par un verbe, description en anglais
  qui dit au modèle QUAND l'utiliser.
- Un outil n'est créé que s'il faut une donnée fiable ou une action ; le reste (rédaction, explication)
  est fait par le modèle.
- Le modèle ne doit jamais inventer une donnée : si elle est introuvable, l'outil renvoie une erreur claire.
- Les outils qui modifient des données ont un paramètre `confirm` : sans `confirm: true`, ils renvoient
  seulement un aperçu. Le prompt système impose de demander confirmation à l'utilisateur avant d'exécuter.
- Les sources d'information (données fictives, documents, API gratuite) sont séparées du code des outils.

## Coding Standards

1. TypeScript strict, code simple et lisible. NE JAMAIS sur-concevoir : pas de fonctionnalité non demandée.
2. Pas de nouvelle dépendance sans me demander.
3. Ne pas modifier agent.ts, ollama.ts ni index.ts sauf si je le demande explicitement.
4. Jamais d'eval() ni de new Function(). Toujours valider les entrées.
5. En cas de problème : identifier la cause avec des preuves (logs, traces d'outils) AVANT de corriger.
   Ne pas deviner. Proposer la plus petite correction possible.
6. Pas d'emojis. README court.

## Testing

- Chaque outil a au moins 2 tests dans apps/backend/src/agent.test.ts : un cas normal et un cas d'erreur.
- Après chaque étape : `bun run typecheck && bun run test` doivent passer.
- Après chaque étape, indiquer en 2 ou 3 lignes comment je peux tester à la main dans l'interface.

## Workflow

- Travailler uniquement sur l'étape de docs/PLAN.md que je demande. Une étape à la fois.
- Avant de coder : résumer en 3 lignes ce qui va être modifié.
- Ne pas cocher les étapes de PLAN.md : je les coche moi-même après avoir testé.
- Ne pas faire de commit : je commite et je pousse moi-même après chaque étape validée.
- Chaque choix technique est ajouté en une ligne dans docs/DECISIONS.md.

## Working Documentation

- docs/SUJET.md : le sujet donné et mes réponses aux questions de cadrage.
- docs/PLAN.md : les étapes, avec sous-étapes, tests et critères de réussite. À lire avant toute action.
- docs/DECISIONS.md : les choix techniques et leurs raisons.

## Implementation Status

(Mis à jour à la fin de chaque étape. Les cases de docs/PLAN.md restent à cocher par toi après tes tests.)
- Socle : agent + outils d'exemple + interface de chat + tests.
- Partie 2 : client PokéAPI (URL fixe, timeout 8 s, cache, noms validés).
- Partie 3 : outils get_pokemon, get_type_matchups (pokemon ou types, calcul en code), get_evolution_chain ; table fixe des 18 types.
- Partie 4 : prompt système (rôle, fiabilité, format, sécurité) ; titre et suggestions du front.
- Partie 5 : schéma de requête (rôles, tailles), contrôle d'ancrage (grounded), badge dans le front, answer.ts (messages encadrés, filtre d'injection fragile).
- Partie 6 : évaluation (16 cas x 3 passages, `bun run eval`), 3 passages réalisés : seuils non atteints (docs/EVALUATION.md).
- Partie 7 (bonus, version minimale) : moteur de combat en code, outil simulate_battle, vue de combat dans le front ; pas de routes /api/battles ; non couvert par l'évaluation.
- Partie 8 : README, EVALUATION.md, DECISIONS.md.
- Limites connues : noms français traduits par le modèle, contrôle d'ancrage heuristique, filtre d'injection fragile (voir README).
