# Décisions techniques

| Choix | Pourquoi | Alternative écartée |
| --- | --- | --- |
| Ollama en local, qwen2.5:7b | Gratuit, bon appel d'outils, rapide sur Mac M4 | Modèle plus gros : trop lent ; API payante : exclue par le test |
| Stack TypeScript, Bun, Hono, React, Vite, Turborepo | Stack de l'équipe ; types partagés entre API et front | Python FastAPI : hors stack de l'équipe |
| Boucle d'agent écrite à la main, sans framework | ~60 lignes, lisible, facile à déboguer et à expliquer | LangChain / LangGraph : trop lourd pour ce périmètre |
| Validation Zod des arguments des outils | Un petit modèle peut produire de mauvais arguments | Exécuter sans valider : risque d'erreurs et d'injection |
| Erreurs renvoyées au modèle | Le modèle peut corriger ses arguments ou expliquer | Faire échouer la requête |
| Limite d'itérations et timeout par outil | Éviter les boucles infinies et les blocages | Aucune limite |
| Température 0,2 | Appels d'outils fiables plutôt que créatifs | Température par défaut |
| API sans état, historique dans le front | Simple ; facile à faire évoluer (persistance) | Stockage serveur des conversations |
| Streaming SSE des étapes | L'utilisateur voit en direct les outils utilisés | Réponse unique à la fin |
| Tests avec un faux LLM | Tests rapides et déterministes, sans Ollama | Tests dépendants du modèle |
| [À COMPLÉTER : architecture mono ou multi-agents] | | |
| [À COMPLÉTER : choix des outils] | | |
