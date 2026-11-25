# Frontend – React + Vite

## Structure

- src/App.tsx : interface de chat. Titre et questions suggérées dans les constantes TITLE et SUGGESTIONS.
- src/api.ts : appels à l'API (streaming SSE et health).
- src/styles.css : styles.

## Règles

- Garder l'interface de chat existante ; ne modifier que ce qui est demandé.
- Toujours afficher les appels d'outils (nom, arguments, résultat) : c'est ce qui montre le fonctionnement de l'agent.
- Pas de nouvelle librairie UI. Style sobre dans styles.css.
- Les types viennent de @app/shared ; ne pas les redéfinir.
