# Frontend – React + Vite

## Structure

- src/App.tsx : interface de chat. Titre et questions suggérées dans les constantes TITLE et SUGGESTIONS.
- src/api.ts : appels à l'API (streaming SSE, health, et routes de combat si le bonus est fait).
- src/styles.css : styles sobres.

## Modifications autorisées

- TITLE et SUGGESTIONS.
- Badge « vérifié » / « à vérifier » sur chaque réponse (champ grounded renvoyé par l'API).
- Bonus combat : un panneau de combat (deux Pokémon, barres de PV, bouton Attaquer, journal, vainqueur),
  dans un composant séparé (src/BattlePanel.tsx).
- Rien d'autre sans demande explicite.

## Règles

- Toujours afficher les appels d'outils (nom, arguments, résultat, durée) : ils prouvent la fiabilité.
- Afficher le texte de l'agent comme du texte simple, jamais comme du HTML (pas de dangerouslySetInnerHTML).
- Pas de nouvelle librairie UI. Les types viennent de packages/shared, ne pas les redéfinir.
