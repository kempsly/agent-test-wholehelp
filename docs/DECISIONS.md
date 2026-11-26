# Décisions techniques

| Choix | Pourquoi | Alternative écartée |
| --- | --- | --- |
| Un seul agent en lecture seule | Un seul rôle, uniquement de la lecture : simple, rapide et fiable avec un modèle local | Multi-agents : latence multipliée sans bénéfice |
| Outils : get_pokemon, get_type_matchups, get_evolution_chain | Un outil par besoin de données ; comparaison et rédaction faites par le modèle | Un outil « compare » : redondant |
| Tout fait vient de PokéAPI via un outil | Fiabilité : le modèle n'invente aucune statistique | Mémoire du modèle : hallucinations |
| Données réduites renvoyées au modèle | Contexte court, moins d'erreurs pour un petit modèle | JSON brut de PokéAPI (énorme) |
| URL de base fixée dans le code | Le modèle ne peut pas appeler une autre URL | Laisser le modèle construire l'URL |
| Validation stricte des noms (regex, longueur) | Bloque l'injection de chemin ou de paramètres | Passer l'argument tel quel |
| Liste fermée d'outils, tous en lecture | Le modèle ne peut rien faire d'autre que lire | Outils génériques (fetch libre) |
| Résultats d'outils traités comme des données | Protège contre l'injection indirecte via l'API | Concaténer les résultats au prompt |
| Prompt système : rôle fixe, refus du hors sujet, pas de révélation du prompt | Résiste aux tentatives de détournement | Prompt permissif |
| Limite de longueur des messages | Réduit les injections longues et les coûts | Aucune limite |
| Contrôle d'ancrage des nombres | Détecte un chiffre inventé dans la réponse | Faire confiance au modèle |
| Évaluation : questions normales, pièges et détournements, 3 passages | Mesure la fiabilité et la sécurité, LLM non déterministe | Tests manuels seulement |
| Cache en mémoire + timeout 8 s | API externe lente ; réponses rapides au 2e appel | Pas de cache |
| Combat en bonus, moteur déterministe en code | Le LLM calcule mal ; le moteur est testable | Combat simulé par le LLM |
| Ollama local qwen2.5:7b, température 0,2 | Gratuit, bon appel d'outils, réponses stables | API payante |
| Stack TypeScript, Bun, Hono, React, Vite, Turborepo | Stack de l'équipe, types partagés | Python |
| Outils : nom anglais ou numéro ; le modèle traduit les noms français | PokéAPI n'indexe pas les noms français ; limite documentée dans le README | Résolution par pokemon-species (requêtes en plus) |
| get_pokemon renvoie french_name ; le prompt impose de le comparer au nom demandé | Détecte une traduction fausse du modèle sans appel supplémentaire | Faire confiance à la traduction |
| Introuvable : erreur qui propose le nom anglais, le numéro ou une forme précise | Guide l'utilisateur sans rien inventer (deoxys, giratina, mr-mime, nidoran-f) | Message d'erreur générique |
| get_type_matchups prend 1 ou 2 types défenseurs, multiplicateur calculé en code | Le LLM ne calcule jamais (x4, x0,25, x0) | Multiplication par le modèle |
| get_evolution_chain obligatoire, sortie en étapes avec branches | Besoin du sujet ; gère Évoli | Chaîne linéaire seulement |
| description_fr limitée à 300 caractères, null si absente | Texte libre venant de l'API : borné ; pas de repli sur une autre langue | Repli sur l'anglais |
| Schéma de requête : rôles user et assistant, 30 messages, 1 000 caractères par message, 20 000 au total | Le front envoie l'historique : on refuse les faux rôles system et tool | Accepter l'historique tel quel |
| Résultats d'outils affichés en texte simple dans le front | Données externes : jamais de HTML | Rendu HTML ou Markdown |
| Contrôle d'ancrage : nombres et noms de types, multiplicateurs et nombres ≤ 2 tolérés | Heuristique assumée, documentée comme telle | Vérification exacte (faux positifs) |
| Évaluation à 16 cas ; seuils : 90 % de bonnes réponses (cas normaux), 100 % de refus (détournements) | Critère de réussite explicite pour un modèle non déterministe | Pas de seuil |
| Combat : Map en mémoire avec expiration de 30 min | Seul état côté serveur ; le reste de l'API reste sans état | Renvoyer tout l'état à chaque appel |
| Tests *.test.ts à côté du code ; agent.test.ts réservé à la boucle | Tests proches du code testé | Tout dans agent.test.ts |
