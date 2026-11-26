# Vidéo de démo de Priora (2 minutes)

Objectif : un recruteur comprend le produit, voit le parcours principal et sait où cliquer. Durée cible : 1 min 55 s, 2 min maximum. Ton : naturel, à la première personne, sans jargon. Environ 260 mots, soit 130 mots par minute.

## Script voix off minuté

| Temps | Voix off |
| --- | --- |
| 0:00 à 0:12 | « Quand un lead arrive, la vraie question d'un commercial, c'est : lequel j'appelle en premier, et qu'est-ce que je lui dis ? Priora répond à ça en dix secondes. » |
| 0:12 à 0:27 | « Voici la file de leads de Maintia, une entreprise fictive. Chaque lead a un score sur cent, un verdict, et un délai de rappel. Les plus chauds remontent en haut, et ceux qui attendent trop longtemps passent en rouge. » |
| 0:27 à 0:55 | « J'ouvre le premier. Le score n'est pas une boîte noire : chaque point a sa raison. Ici, le secteur est dans la cible, l'effectif aussi, et le prospect parle d'un budget validé. En dessous, le verdict : appeler maintenant. Et le script d'ouverture de trente secondes, avec les objections probables et les questions de découverte. » |
| 0:55 à 1:10 | « Priora gère les rôles. Si je me mets à la place d'un commercial, je ne vois que mes leads. Le manager, lui, voit tout, et l'admin règle l'outil. Ces droits sont appliqués côté serveur. » |
| 1:10 à 1:25 | « Le manager a son tableau de bord : délai médian de premier contact, part des rappels faits dans le délai, conversion par tranche de score, classement des commerciaux. » |
| 1:25 à 1:47 | « Ce qui me tient à cœur, c'est la calibration. Un score ne vaut que s'il prédit les ventes. Priora compare chaque critère au résultat des leads gagnés ou perdus, montre ceux qui comptent vraiment, propose de nouveaux poids, et garde chaque version pour revenir en arrière. Ici l'historique est fictif, c'est la méthode qui est montrée. » |
| 1:47 à 2:00 | « Le même moteur s'adapte à un autre métier : voici le cas Orus, en assurance des TPE. La démo est en ligne, sans compte, et tout est fictif. Merci d'avoir regardé. » |

À relire à voix haute avec un chronomètre : si vous dépassez 2 min, couper la phrase sur les rôles (0:55) en premier.

## Découpage plan par plan

Parcours identique à celui de `scripts/record-demo.mjs` (vidéo sans voix, environ 1 min 10 s : à ralentir ou allonger les pauses pour coller à la voix off, ou à refaire à la main).

| # | Écran | Action | Durée |
| --- | --- | --- | --- |
| 1 | Page d'accueil `/` | Plan fixe sur le titre et la fiche lead, puis léger défilement vers le bas et retour | 12 s |
| 2 | Clic sur « Essayer la démo », file `/leads` | Le curseur va au bouton, clic, la file apparaît ; survol des colonnes Verdict et Premier contact (un lead « En retard ») | 15 s |
| 3 | Fiche du premier lead | Clic sur la ligne ; arrêt sur le verdict ; défilement lent : score détaillé, script d'ouverture, objections | 28 s |
| 4 | « Voir en tant que » dans la barre latérale | Clic sur Camille (commercial) : la liste se réduit ; clic sur Hélène (admin) pour revenir | 15 s |
| 5 | Tableau de bord `/dashboard` | Arrêt sur les cartes de délai, puis sur la conversion par tranche | 15 s |
| 6 | Calibration `/calibration` | Taux de gain par tranche, défilement vers le tableau « Pouvoir prédictif », puis la suggestion de poids et l'aperçu avant et après | 22 s |
| 7 | Retour à l'accueil, « Voir le cas Orus » | Clic ; bandeau « Cas d'étude » visible, file Orus | 13 s |

Total : 120 s.

## Enregistrement

### Option A : automatique, sans voix

1. Lancer l'appli : `npm run build` puis `PRIORA_PUBLIC_DEMO=true npm run start` (ou `npm run dev`).
2. Une seule fois : `npx playwright-core install ffmpeg` (petit binaire d'encodage).
3. `node scripts/record-demo.mjs http://localhost:3000` : la vidéo `docs/video/demo-priora.webm` (1920x1080) est créée, curseur visible (point vert). Le dossier `docs/video/` est ignoré par Git.
4. Ajouter la voix off au montage (voir plus bas).

Edge ou Chrome doit être installé (`PW_CHANNEL=chrome` pour Chrome).

### Option B : à la main avec OBS Studio (gratuit)

1. Installer OBS Studio (obsproject.com). Scène avec une source « Capture de fenêtre » du navigateur.
2. Paramètres, Vidéo : base et sortie 1920x1080, 30 images par seconde. Sortie : MP4 ou MKV, qualité « indiscernable », encodeur matériel si disponible.
3. Navigateur : fenêtre en 1920x1080 (ou zoom 100 % en plein écran, touche F11), thème sombre, barre de favoris masquée, notifications du système coupées (assistant de concentration).
4. Curseur : Paramètres Windows, Accessibilité, Pointeur de la souris : agrandir et choisir une couleur vive (ou activer « Capturer le curseur » dans OBS). Déplacer la souris lentement, cliquer sans à-coups, jamais de mouvement pendant une phrase importante.
5. Audio : micro seul (casque ou micro-cravate), pièce calme, filtre « Suppression du bruit » activé dans OBS, niveau autour de -12 dB.
6. Faire un essai de 20 secondes, le réécouter, puis enregistrer. Une prise par plan est plus simple qu'une prise unique.
7. Avant de filmer : ouvrir la démo dans une fenêtre privée (bac à sable neuf), cliquer « Visite guidée » puis « Fermer » (la visite ne doit pas couvrir l'écran), et vérifier que « Réinitialiser la démo » a été cliqué.

### Montage et diffusion

- Montage gratuit : Clipchamp (inclus dans Windows 11) ou DaVinci Resolve.
- Sous-titres en français (accessibilité et lecture sans le son) : exporter un fichier `.srt` depuis le script ci-dessus.
- Hébergement : YouTube en « non répertorié », puis le lien dans le CV et sur LinkedIn. Ne pas mettre la vidéo dans le dépôt (le dossier `docs/video/` est exclu de Git).
- Ne jamais présenter les chiffres comme réels : dire « fictif » ou « de démonstration » à l'oral (le script le fait deux fois).
