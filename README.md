# Agent conversationnel – socle (Ollama + Bun + Hono + React)

Monorepo Turborepo :

```
apps/backend        API Bun + Hono : boucle d'agent, appel d'outils, endpoint streaming (SSE)
apps/frontend        Front React + Vite : chat, affichage des appels d'outils
packages/shared Types partagés entre l'API et le front (le contrat)
```

## 1. Installation (une seule fois, sur Mac)

```bash
# Bun (exécute TypeScript, gère les paquets)
curl -fsSL https://bun.sh/install | bash

# Ollama (LLM local) : télécharger l'app sur https://ollama.com puis
ollama pull qwen2.5:7b          # bon appel d'outils, ~4,7 Go, rapide sur M4
# alternatives : llama3.1:8b  |  qwen3:8b (plus lent : mode "réflexion")  |  qwen2.5:3b (machine modeste)

# Projet
cp .env.example .env
bun install
```

Vérifier le modèle : `ollama run qwen2.5:7b "Bonjour"` doit répondre en quelques secondes.

## 2. Lancer

```bash
bun run dev        # lance l'API (port 3001) ET le front (port 5173) via Turborepo
```

Ouvrir http://localhost:5173. En haut : « Modèle : qwen2.5:7b » = tout est connecté.

Autres commandes : `bun run test` (tests de l'agent, sans Ollama), `bun run typecheck`.

Tester l'API seule :

```bash
curl -s localhost:3001/api/health
curl -s -X POST localhost:3001/api/chat -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Combien font 1250 HT avec 20% de TVA ?"}]}'
```

## 3. Le jour du test : quoi modifier

| Fichier | Quoi faire |
| --- | --- |
| `apps/backend/src/prompt.ts` | Adapter le rôle et les règles au sujet |
| `apps/backend/src/tools/examples.ts` | Créer les outils du sujet (copier un outil existant) |
| `apps/backend/src/tools/index.ts` | Ajouter les nouveaux outils à la liste `tools` |
| `apps/backend/src/tools/knowledge.ts` | Remplacer les données d'exemple par celles du sujet |
| `apps/frontend/src/App.tsx` | Changer `TITLE` et `SUGGESTIONS` |

Ajouter un outil = 3 étapes :

```ts
export const getWeather = defineTool({
  name: "get_weather",
  description: "Returns the weather for a city. Use it when the user asks about weather.",
  schema: z.object({ city: z.string().describe("City name") }),
  execute: async ({ city }) => ({ city, temperature: 12, sky: "cloudy" }), // données simulées ou vraie API
});
// puis l'ajouter dans tools/index.ts : [getCurrentDateTime, calculator, searchKnowledgeBase, getWeather]
```

## 4. Comment ça marche

1. Le front envoie tout l'historique à `POST /api/chat/stream` (l'API est sans état).
2. L'agent (`apps/backend/src/agent.ts`) envoie le prompt système + l'historique + la liste des outils à Ollama.
3. Si le modèle demande des outils : on valide les arguments (Zod), on exécute (en parallèle, avec timeout), on renvoie les résultats au modèle.
4. On recommence jusqu'à une réponse sans appel d'outil, avec une limite de 6 itérations.
5. Les événements (`tool_call`, `tool_result`, `done`) sont envoyés en direct au front (SSE).

## 5. Choix techniques (à expliquer au débrief)

- **Ollama appelé en HTTP direct, sans SDK ni framework d'agent** : la boucle tient en ~60 lignes, lisible et facile à déboguer ; on peut changer de fournisseur en remplaçant `ollama.ts` (l'agent dépend d'une fonction `ChatFn`).
- **Zod pour chaque outil** : la même définition sert à générer le JSON Schema envoyé au modèle et à valider les arguments produits par le modèle avant exécution.
- **Erreurs renvoyées au modèle** (arguments invalides, outil inconnu, timeout) au lieu de planter : le modèle peut se corriger ou expliquer.
- **Garde-fous** : limite d'itérations, timeout par outil, liste blanche d'outils, calculatrice sans `eval` (pas d'injection de code), validation des requêtes, CORS limité au front.
- **Température basse (0,2)** : on veut des appels d'outils fiables, pas de la créativité.
- **API sans état** : l'historique vit dans le front ; simple à faire évoluer (persistance, multi-utilisateurs).
- **Types partagés** (`packages/shared`) : le front et l'API ne peuvent pas diverger sur le contrat.
- **Streaming SSE** : l'utilisateur voit en direct quels outils l'agent utilise (transparence, attente perçue réduite).
- **Tests avec un faux LLM** : la boucle d'agent est testée de façon déterministe, sans Ollama.

Pistes d'amélioration à citer : streaming token par token de la réponse finale, mémoire persistante,
RAG avec embeddings (`nomic-embed-text` via Ollama) à la place de la recherche par mots-clés,
évaluation automatique sur un jeu de questions, authentification, observabilité (traces par requête).

## 6. Dépannage

- « Ollama injoignable » : lancer l'app Ollama (ou `ollama serve`).
- « Modèle non installé » : `ollama pull qwen2.5:7b`, ou changer `OLLAMA_MODEL` dans `.env`.
- Le modèle n'appelle pas les outils : rendre la `description` de l'outil plus explicite, rappeler la règle dans le prompt.
- Réponses lentes : `ollama ps` pour voir le modèle chargé ; passer à `qwen2.5:3b`.
- Port occupé : changer `API_PORT` dans `.env` (et le proxy dans `apps/frontend/vite.config.ts`).

## 7. Partager le code à la fin

```bash
git init && git add . && git commit -m "Agent conversationnel"
# créer un dépôt sur GitHub puis :
git remote add origin https://github.com/kempsly/<nom-du-depot>.git && git push -u origin main
```
