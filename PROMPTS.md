# Prompts pour Claude Code – test WholeHelp

Remplacer tout ce qui est entre [CROCHETS]. Une partie à la fois.
Après chaque partie : tester à la main → cocher dans docs/PLAN.md → commit + push.

```bash
git add . && git commit -m "[MESSAGE]" && git push
```

---

## 0. Démarrage (avant que Benjamin donne le sujet)

```
Lis CLAUDE.md, apps/backend/CLAUDE.md, apps/frontend/CLAUDE.md et docs/PLAN.md.
Résume en 5 lignes l'architecture du projet et la façon dont la boucle d'agent fonctionne.
Ne modifie rien.
```

---

## 1. Cadrage du sujet (mode plan : Shift+Tab)

Remplir d'abord docs/SUJET.md avec ce que dit Benjamin, puis :

```
Lis docs/SUJET.md. Fais la partie 1 de docs/PLAN.md, sans écrire de code :
1. les besoins de l'utilisateur (2 ou 3) ;
2. la source d'information : données fictives, documents, API gratuite, calcul ou aucune ;
3. les outils nécessaires (3 à 5 maximum) : nom en snake_case, paramètres, ce qu'ils renvoient,
   lecture ou action (avec confirm) ;
4. l'architecture : un seul agent par défaut ; multi-agents seulement si le sujet l'impose, avec la raison ;
5. les cas pièges à tester (donnée inexistante, demande ambiguë, hors sujet, action sans confirmation).
Complète les parties 2 à 6 de docs/PLAN.md avec les noms des outils
et ajoute les choix dans docs/DECISIONS.md.
```

Relire, corriger à voix haute, puis :

```
Je valide le plan avec ces modifications : [MODIFICATIONS ou "aucune"].
Mets à jour docs/PLAN.md et docs/DECISIONS.md en conséquence.
```

Commit : `docs: plan et choix d'architecture`

---

## 2. Sources d'information (choisir le cas)

**Cas A – données fictives**
```
Fais la partie 2 de docs/PLAN.md : crée apps/backend/src/tools/data.ts avec [NOMBRE] [ÉLÉMENTS]
réalistes pour le sujet (champs : [CHAMPS]). Inclus des cas limites : [EXEMPLES].
Remplace le contenu d'exemple de knowledge.ts seulement si c'est utile au sujet.
```

**Cas B – documents de référence (FAQ, règles, procédures)**
```
Fais la partie 2 de docs/PLAN.md : remplace les entrées de apps/backend/src/tools/knowledge.ts
par [NOMBRE] fiches de référence sur [SUJET] (id, title, tags, content), courtes et factuelles.
L'outil search_knowledge_base servira à y chercher.
```

**Cas C – API gratuite sans clé**
```
Fais la partie 2 de docs/PLAN.md : crée un petit client pour l'API [NOM_API] ([URL]) dans
apps/backend/src/tools/[nom].ts, avec fetch, un timeout et une erreur claire si l'API ne répond pas.
Pas de nouvelle dépendance.
```

**Cas D – aucune donnée externe** : sauter la partie 2 et le noter dans docs/DECISIONS.md.

Commit : `feat: sources d'information`

---

## 3. Outils de lecture (un prompt par outil)

```
Fais l'outil [NOM_OUTIL] de la partie 3 de docs/PLAN.md :
- paramètres : [PARAMÈTRES] ; renvoie : [RETOUR] ;
- description en anglais qui dit au modèle QUAND l'utiliser ;
- si la donnée est introuvable, renvoyer { error: "..." } explicite ;
- ajoute-le à la liste dans src/tools/index.ts ;
- ajoute 2 tests unitaires : cas normal et donnée introuvable.
Lance typecheck et tests, puis dis-moi quelle question poser dans l'interface pour le tester.
```

Commit : `feat: outil [NOM_OUTIL]`

Après le dernier outil de lecture :

```
Retire de la liste des outils les outils d'exemple qui ne servent pas au sujet
(garde-les dans le code). Mets à jour les tests si nécessaire.
```

---

## 4. Outil d'action (seulement si l'agent doit créer, envoyer ou modifier)

```
Fais l'outil [NOM_ACTION] de la partie 4 de docs/PLAN.md :
- paramètres : [PARAMÈTRES] + confirm (boolean) ;
- sans confirm: true, renvoyer uniquement un aperçu de l'action, sans rien modifier ;
- avec confirm: true, exécuter l'action (en mémoire) et renvoyer le résultat ;
- 2 tests unitaires : aperçu sans confirmation, exécution avec confirmation.
```

Commit : `feat: outil [NOM_ACTION] avec confirmation`

---

## 5. Prompt système

```
Fais la partie 5 de docs/PLAN.md : adapte apps/backend/src/prompt.ts au sujet [SUJET] :
- rôle : [RÔLE] pour [UTILISATEUR], ton [TON], réponses en [LANGUE] ;
- quand utiliser chaque outil (une ligne par outil) ;
- ne jamais inventer une donnée : si un outil ne trouve rien, le dire ;
- poser une question de clarification si la demande est ambiguë ;
- avant toute action, montrer l'aperçu et demander confirmation ;
- réponses courtes.
Reste concis.
```

Commit : `feat: prompt système`

---

## 6. Interface

```
Fais la partie 6 de docs/PLAN.md : dans apps/frontend/src/App.tsx, mets TITLE à "[TITRE]"
et SUGGESTIONS à : "[QUESTION 1]", "[QUESTION 2]", "[QUESTION 3]". Ne change rien d'autre.
```

Commit : `feat: interface adaptée au sujet`

---

## 7. Robustesse (à 80 min : plus de nouvelle fonctionnalité)

```
Fais la partie 7 de docs/PLAN.md : relis les outils et le prompt. Liste les cas qui pourraient
mal se passer (donnée introuvable, mauvais arguments, demande ambiguë, hors sujet, action sans
confirmation, résultat vide). Pour chacun : géré ou non. Ne corrige rien pour l'instant.
```

```
Corrige uniquement ces cas : [LISTE]. Plus petite correction possible, avec un test pour chacun.
```

Commit : `fix: cas limites`

---

## 8. Livraison

```
Fais la partie 8 de docs/PLAN.md : mets à jour le README (sujet, outils, comment lancer,
choix principaux, limites connues), docs/DECISIONS.md et la section Implementation Status
de CLAUDE.md. Court, sans emojis.
```

Commit + push final : `docs: README et décisions`. Envoyer le lien du dépôt à Benjamin.

---

## Bonus (seulement s'il reste du temps)

**Contrôle anti-hallucination**
```
Ajoute un contrôle d'ancrage dans le backend après la réponse finale : extraire les nombres
de la réponse et vérifier que chacun apparaît dans les résultats des outils de ce tour.
Ajouter grounded (boolean) et la liste des nombres non vérifiés dans la réponse de l'API.
Dans le front, afficher un badge "vérifié" ou "à vérifier". Ne pas modifier la boucle d'agent.
2 tests.
```

**Évaluation de la fiabilité**
```
Crée apps/backend/eval/cases.json (12 questions sur le sujet : 8 normales, 2 sur une donnée
inexistante, 1 ambiguë, 1 action à confirmer, avec l'outil attendu et un élément attendu dans
la réponse) et apps/backend/eval/run.ts avec la commande bun run eval. Lancer chaque question
3 fois sur le vrai modèle et afficher : bon outil (%), bons arguments (%), bonne réponse (%),
pas d'invention (%), confirmation respectée (%), latence moyenne. Pas de nouvelle dépendance.
```

**Couverture de tests**
```
Lance bun test --coverage dans apps/backend et dis-moi si on est au-dessus de 80 % des lignes.
Si non, propose seulement les tests qui protègent un comportement important.
```

---

## Si le sujet demande plusieurs agents

```
Le sujet demande deux rôles distincts : [RÔLE 1] et [RÔLE 2]. Propose, sans coder, la solution
la plus simple : un routeur qui choisit le rôle (un appel LLM court) puis la boucle d'agent
existante avec un prompt et une liste d'outils propres à chaque rôle. Explique le coût en
latence. Ne modifie pas agent.ts : réutilise runAgent avec des options différentes.
```

Après validation :

```
Implémente la solution validée, avec 2 tests sur le routage (un par rôle).
```

---

## Débogage

```
Quand je demande "[QUESTION]", l'agent [CE QUI SE PASSE] au lieu de [CE QUI EST ATTENDU].
Voici la trace des appels d'outils : [COLLER]. Explique d'abord la cause probable avec des preuves,
sans corriger. Ensuite, propose la plus petite correction (souvent la description de l'outil
ou une règle du prompt).
```

```
Le test [NOM] échoue avec cette erreur : [COLLER]. Trouve la cause avant de corriger.
```

```
bun run dev affiche cette erreur : [COLLER]. Diagnostique sans rien modifier.
```

```
Annule ta dernière modification : elle ne correspond pas à ce que je voulais.
```

---

## Préparation du débrief (dernières minutes)

```
Résume en 8 points les choix techniques de ce projet et, pour chacun, la raison et l'alternative
écartée, à partir de docs/DECISIONS.md et du code. Puis liste 3 améliorations prioritaires.
```
