# Plan de réalisation

Règle : une partie à la fois. Pour chaque partie, l'agent fait les sous-étapes, lance
`bun run typecheck && bun run test`, et explique comment tester à la main.
Je teste, je coche, puis je commite et je pousse.

## Partie 1 – Cadrage et plan (10 min)

Enrichir ce document à partir de docs/SUJET.md : nommer les outils, les sources d'information
et l'architecture (mono-agent par défaut). Ne pas coder. Je valide le plan avant de continuer.

- [ ] Lister les besoins de l'utilisateur (2 à 3)
- [ ] Choisir la source d'information : données fictives / documents / API gratuite / calcul / aucune
- [ ] Proposer 3 à 5 outils : nom, paramètres, retour, lecture ou action (confirm)
- [ ] Choisir l'architecture (mono-agent ou multi-agents) et justifier dans docs/DECISIONS.md
- [ ] Compléter les parties 2 à 6 ci-dessous avec les noms des outils

Critère de réussite : plan validé par moi.
Commit : `docs: plan et choix d'architecture`

## Partie 2 – Sources d'information

- [ ] Créer apps/backend/src/tools/data.ts (données fictives réalistes, 10 à 20 éléments) OU le contenu de référence
      OU le client de l'API gratuite
- [ ] Inclure des cas limites (élément introuvable, champ vide, noms proches)

Test : les données couvrent les besoins de docs/SUJET.md.
Critère de réussite : typecheck OK.
Commit : `feat: sources d'information`

## Partie 3 – Outils de lecture

- [ ] Outil 1 : [NOM] – 2 tests (normal + erreur)
- [ ] Outil 2 : [NOM] – 2 tests (normal + erreur)
- [ ] Outil 3 : [NOM] – 2 tests (normal + erreur)
- [ ] Retirer de la liste les outils d'exemple inutiles pour le sujet

Test manuel : une question par outil dans l'interface ; vérifier l'appel d'outil affiché
et une question sur une donnée introuvable (l'agent ne doit rien inventer).
Critère de réussite : tests OK, bon outil appelé avec les bons arguments.
Commit : un commit par outil, ex. `feat: outil list_invoices`

## Partie 4 – Outil d'action (si le sujet le demande)

- [ ] Outil : [NOM] avec paramètre confirm (aperçu sans confirm: true)
- [ ] 2 tests : aperçu sans confirmation, exécution avec confirmation

Test manuel : l'agent montre l'aperçu, demande confirmation, puis exécute après « oui ».
Critère de réussite : aucune action exécutée sans confirmation.
Commit : `feat: outil [NOM] avec confirmation`

## Partie 5 – Prompt système

- [ ] Rôle et ton adaptés au sujet
- [ ] Règles d'utilisation de chaque outil
- [ ] Interdiction d'inventer, clarification si ambigu, confirmation avant action
- [ ] Langue des réponses

Test manuel : 1 question normale, 1 question ambiguë (→ clarification), 1 question hors sujet.
Critère de réussite : réponses fiables et courtes.
Commit : `feat: prompt système`

## Partie 6 – Interface

- [ ] TITLE adapté au sujet
- [ ] 3 SUGGESTIONS représentatives des besoins

Test manuel : cliquer sur chaque suggestion, vérifier réponse et appels d'outils.
Critère de réussite : démo fluide.
Commit : `feat: interface adaptée au sujet`

## Partie 7 – Robustesse (stop des nouvelles fonctionnalités à 80 min)

- [ ] Lister les cas limites non gérés (sans corriger), je choisis lesquels traiter
- [ ] Corriger les cas choisis
- [ ] Tous les tests passent

Commit : `fix: cas limites`

## Partie 8 – Livraison

- [ ] README : sujet, outils, comment lancer, limites connues
- [ ] docs/DECISIONS.md à jour
- [ ] Section « Implementation Status » de CLAUDE.md à jour

Commit et push final : `docs: README et décisions`. Envoyer le lien du dépôt à Benjamin.
