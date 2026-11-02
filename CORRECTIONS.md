# Corrections du mentorat — Élise (SafeHer)

Ce document résume les corrections apportées à la suite de la revue du mentor,
et ce qui reste à faire valider par l'équipe (notamment par un professionnel de santé).

## 1. Sécurité des réponses (backend)

Nouveau découpage pour que la logique de sûreté soit isolée et relisable :

- `backend/src/chat/safety.data.ts` — **données** du Safety Engine, sans code :
  listes d'alerte (français, ivoirien, nouchi), messages d'urgence préécrits,
  règles du filtre de sortie. **À faire relire par une sage-femme / un médecin.**
- `backend/src/chat/safety.service.ts` — logique : classification par liste,
  détection de contournement, filtre de sortie.
- `backend/src/chat/claude.service.ts` — appel au modèle **avec l'historique**,
  puis application des règles de sûreté.

Corrections :

1. **Historique transmis au modèle.** Fin du « Bonjour » répété : le modèle voit
   les échanges précédents et ne salue qu'au premier message. L'historique est
   gardé **par session, en mémoire seulement**, jamais écrit sur disque.
2. **Classification robuste.** `niveau_final = max(liste_alerte, classification_LLM)`.
   Toute demande de médicament ou de diagnostic est au minimum « Consultation »
   (niveau 3). En cas de doute, le niveau supérieur l'emporte.
3. **Messages d'urgence préécrits.** Au niveau rouge, un texte **validé** est servi
   tel quel (agression, idées suicidaires, urgence médicale), avec « Es-tu en
   sécurité ? » et le délai des 72 h. Le modèle ne peut pas le remplacer.
4. **Filtre de sortie.** Toute réponse qui nommerait une maladie ou un médicament
   est remplacée par une formulation sûre, et le niveau est relevé.
5. **Contournements journalisés.** Les tentatives de type « Dr Koné » sont détectées,
   refusées poliment et journalisées (sans stocker le contenu).

## 2. Confidentialité (frontend)

- **Sortie rapide** (bouton + touche Échap) : remplace la page sans laisser Élise
  dans l'historique du navigateur.
- **Mode discret** : onglet et icône « Notes » (titre neutre par défaut).
- **Écran masqué hors focus** : l'aperçu du sélecteur d'applications n'affiche rien.
- **Effacement** : « Effacer cette conversation » et « Tout effacer » (côté client
  et côté serveur), avec réinitialisation de la session.
- **Panneau « Votre confidentialité »** (badge *Confidentiel* cliquable) avec la
  liste **« Ce que nous gardons »**.
- Indicateur **« Conversation non enregistrée »** dans l'en-tête.

## 3. Interface et ton

- Pied de page corrigé (hackathon L'Aube de l'IA, Édition 2 — BAIC).
- Badge « Claude connecté » retiré (ne pas exposer la techno au jury/utilisatrices).
- « Safety Engine » → **« Comment Élise vous protège »**.
- Étiquette « INFORMATION » retirée des réponses simples.
- **Urgence en premier** dans les suggestions, y compris sur mobile.
- Contraste du texte secondaire amélioré ; tutoiement cohérent.

## 4. Évaluation (preuve avant/après)

- `backend/eval/questions.json` — 50 questions (info, surveillance, consultation,
  médicament, diagnostic, urgences, contournement, hors-sujet).
- `backend/eval/run-eval.mjs` — rejoue chaque question, vérifie le niveau, l'absence
  de diagnostic/médicament et la présence d'un numéro d'urgence, puis exporte un CSV.

Lancer (backend démarré) :

```bash
cd backend
npm run eval              # mode local (sans clé)
RUNS=3 npm run eval       # rejoue 3 fois chaque question (modèle non déterministe)
```

Résultat **mode local** (base de référence, sans clé API) : **49/50 (98 %)**,
**0 réponse non sûre**, **100 % des urgences** classées rouge.
À relancer **avec la clé API** pour mesurer le mode réel, puis conserver les CSV
`avant` / `après` comme preuve pour le jury.

## Reste à faire (hors code)

- ~~Faire **valider les 3 messages d'urgence** par un professionnel de santé.~~ Fait (nov. 2026).
- Numéros : **185** (SAMU) et **1308** (VBG) confirmés et conservés ; le **139** a été retiré faute de source officielle. Vérifier 185 et 1308 sur un vrai téléphone.
- Construire la **base de sources** (OMS, ministère, ONG) + brancher le RAG
  (les PDF doivent être fournis à l'équipe).
- Tester le masquage d'écran sur **Android et iOS** réels.
- Faire relire les expressions **nouchi** par une locutrice.
