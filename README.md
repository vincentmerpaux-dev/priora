# Priora

Qualification de leads inbound pour équipes commerciales : les leads entrants sont enrichis, reçoivent un score transparent sur 100, et une fiche d'appel dit s'il faut appeler, quelles objections et quels risques prévoir, et comment ouvrir l'appel. Multi-organisation, configurable.

Étape actuelle : **S4 (vitrine et démo publique)**, au-dessus du MVP S1, de S2 (équipe) et de S3 (intégrations et calibration). Mise en ligne visée : Vercel gratuit, sans Supabase (voir « Déployer sur Vercel en 5 minutes »).

## Ce qui est fait (S1)

1. Authentification Supabase (email + mot de passe, ou lien magique) et création d'organisation.
2. Onboarding en 5 étapes : entreprise, offre, cible idéale, critères pondérés (préremplis BANT/MEDDIC), objections.
3. Ingestion : formulaire public intégrable (`/f/[slug]` + snippet iframe), webhook `POST /api/webhooks/leads` (clé par organisation), import CSV (mapping de colonnes, aperçu, progression), saisie manuelle.
4. Enrichissement : API Recherche d'entreprises (SIREN, effectif, NAF, création, ville) + lecture du site web (titre, description) depuis le domaine de l'email pro. Timeouts et erreurs gérés, protégé contre le SSRF.
5. Score sur 100 (adéquation + intention + timing), chaque point justifié par une raison. Moteur de règles pur, testé (vitest).
6. Fiche lead IA : résumé, besoin, verdict (Appeler maintenant / Nourrir / Disqualifier), objections (bibliothèque de l'organisation en priorité), risques avec niveau, questions de découverte, script d'ouverture de 30 s.
7. File de leads priorisée (priorité = score moins 2 points par jour, filtres, recherche) et pipeline kanban glisser-déposer (sélecteur de statut en alternative tactile et clavier).
8. Écrans : connexion, onboarding, file, fiche lead, pipeline, objections, réglages (critères, sources, clé webhook, snippet iframe).
9. Thème sombre (défaut) et clair, tokens dans `src/styles/tokens.css` (réutilisables pour Vigie), PWA (manifest, service worker, page hors ligne).

## Ce qui est fait (S2 : équipe)

1. **Rôles** admin, manager, commercial (`src/lib/team/permissions.ts`). Page **Équipe** (`/team`) : liste, invitation par email (Supabase Auth en mode réel, **simulée** en démo), changement de rôle, désactivation (un membre désactivé perd tout accès, historique conservé). Garde-fous : pas d'auto-modification, au moins un admin actif.
2. **Droits appliqués côté serveur** (pages via `requirePermission`, actions via `orgWithPermission` et `loadLeadForWrite`), pas seulement dans l'interface : le commercial ne voit ni tableau de bord, ni équipe, ni réglages (page "Accès réservé"), ne reçoit que ses leads (ou la file commune en lecture seule si l'organisation l'autorise) ; le manager voit tout, réattribue, pilote, mais n'administre pas ; l'admin gère réglages, équipe, critères, personas, sources.
3. **Mode démo multi-utilisateurs** : 5 membres fictifs par organisation (1 admin, 1 manager, 3 commerciaux) et sélecteur **"Voir en tant que"** (barre latérale, liste déroulante sur mobile), étiqueté Démo. Le poste simulé est conservé quand on change d'organisation.
4. **Attribution automatique** de tous les nouveaux leads (formulaire, webhook, CSV, saisie) : tour de rôle entre commerciaux actifs, ou règles par segment (source, produit ou secteur par mots-clés, score minimum vers un commercial précis, première règle gagnante, repli en tour de rôle), ou manuelle. Réattribution par le manager depuis la fiche et en masse depuis la file (jusqu'à 100). Chaque attribution est écrite dans les activités. Maintia démontre le tour de rôle, Cas Orus les segments.
5. **Speed-to-lead** : délais cibles par organisation (défaut 5 min pour "Appeler maintenant", 2 h pour "Nourrir", aucun pour "Disqualifier"). Premier contact = première activité appel ou email, ou passage à un statut autre que Nouveau. Compte à rebours, "En retard de ..." (couleurs alerte et danger), compteur "En retard" et filtre dans la file, panneau dans la fiche. **Alerte visuelle uniquement : aucun email ni push en S2** (notification réelle à faire en S3). Délais calculés en temps réel, sans heures ouvrées.
6. **Tableau de bord** (`/dashboard`, manager et admin) : période 7, 30 ou 90 jours ; volume par jour et par source ; délai médian et % dans le délai ; conversion par tranche de score (0-39, 40-69, 70-100) ; pipeline par statut ; classement des commerciaux. Graphiques maison en HTML et CSS (sans bibliothèque), lisibles en sombre et en clair. Taux de gain = gagnés / (gagnés + perdus).
7. **Personas** (nom, rôle, enjeux, objections typiques) dans l'onboarding (étape 4) et les réglages ; l'analyse par règles rattache chaque lead au plus proche (fonction du contact, puis vocabulaire commun, au moins deux mots) et l'affiche sur la fiche ; le prompt IA les reçoit et renvoie le persona choisi. Les anciens personas S1 (titre, description) sont convertis à la lecture.

**Historique fictif de démonstration** : chaque organisation reçoit en plus de ses 30 leads environ 120 à 150 leads historiques sur 90 jours, générés de façon déterministe (`src/lib/demo/team.ts`) avec activités, délais, gagnés et perdus, marqués `isDemo` et annoncés par un bandeau sur le tableau de bord. Les chiffres du tableau de bord en démo ne sont donc pas réels. Les commerciaux ont des profils volontairement différents (rapidité, efficacité). Le pipeline masque les leads clos depuis plus de 30 jours.

Parcours de démo en 3 minutes (S2) : 1) en admin, ouvrir la file : colonnes "Premier contact" et "Attribué à", compteur "En retard" ; 2) cliquer "Voir en tant que" Camille (commercial) : "Mes leads", plus de tableau de bord ni d'équipe ; 3) revenir en manager : Tableau de bord (7, 30, 90 jours, thème clair), sélectionner deux leads dans la file et les réattribuer, créer un lead (il est attribué, le compte à rebours démarre) ; 4) en admin : Équipe (inviter, changer un rôle, désactiver) et Réglages > Attribution et délais ; 5) basculer sur Cas Orus pour voir les règles par segment et la file commune ouverte.

## Ce qui est fait (S3 : intégrations et calibration)

1. **Email entrant** : `POST /api/inbound/email/<clé>`, agnostique du fournisseur (Postmark JSON, Mailgun Routes, SendGrid Inbound Parse, format générique pour Cloudflare Email Worker ; JSON, url-encodé ou multipart). Clé d'organisation dans l'URL (hash SHA-256 seul stocké, affichée une fois) ou en-tête `Authorization: Bearer` / `x-api-key`, limitation de débit par IP et par organisation. Extraction : expéditeur, objet, corps sans citations (« Le ... a écrit »), signature, disclaimers ; téléphone, fonction, entreprise (signature puis domaine pro). Ignorés avec un 200 : réponses automatiques, newsletters, bounces. Même expéditeur dans les 24 h : activité « Email reçu » sur le lead existant (qui ne compte pas comme premier contact), pas de nouveau lead. Sinon pipeline normal (enrichissement, score, attribution, analyse), source « Email ». Réglages > Email entrant : endpoint, clé, instructions par fournisseur, **simulateur « Coller un email »** (aperçu du lead extrait avant création, démo et réel).
2. **HubSpot** (offre gratuite, jeton d'application privée) : Réglages > Intégrations (admin). Jeton chiffré AES-256-GCM (`INTEGRATIONS_ENCRYPTION_KEY`) dans une table sans policy RLS, lisible seulement avec la clé service role, jamais renvoyé au client. Envoi à la qualification et au gain (option) et bouton « Envoyer vers HubSpot » sur la fiche : contact créé ou mis à jour par email, transaction avec score et verdict (propriétés `priora_score` et `priora_verdict`, repli dans la description si les portées de schéma manquent). Import des contacts des 30 derniers jours comme leads « CRM », sans doublon. Client isolé (`src/lib/integrations/hubspot/client.ts`) : 401, 403, 429 avec réessai (Retry-After), 5xx, réseau. Journal de synchronisation visible. **Démo** : connexion simulée, faux HubSpot au niveau de fetch (même client, mêmes réessais), contacts fictifs, sélecteur d'incidents (429, 401, 500). Pipedrive : interface `CrmAdapter` seulement, **implémentation prévue en V2**.
3. **Calibration** (`/calibration`, manager et admin) : taux de gain par tranche de score et par verdict, pouvoir prédictif de chaque critère (taux de gain « beaucoup de points » contre « peu », écart en points, effectifs, fiabilité : moins de 10 leads par groupe = aucune conclusion, 10 à 24 = indicatif, 25 et plus = fiable). **Suggestion de poids** : très prédictif +jusqu'à 25 %, sans effet -20 %, à contre-sens -25 %, effectif trop faible = poids figé, renormalisation à 100 en entiers sans dépasser ±25 %. Aperçu avant/après (leads qui changent de verdict, taux de gain simulé par tranche). L'admin applique (les poids sont recalculés côté serveur) ; **versions de configuration** avec historique et retour arrière (aussi pour les modifications faites dans Réglages). Le manager consulte seulement. Motif de gain facultatif (liste + texte) en plus du motif de perte ; chaque passage Gagné ou Perdu crée un outcome (aussi garanti par un trigger SQL). Les scores déjà calculés ne sont pas recalculés.
4. **Notifications** : cloche (non lues) pour lead attribué, message d'un prospect connu, « Appeler maintenant » en retard (une notification par lead pour le responsable, un résumé quotidien pour managers et admins), échec de synchronisation (admins). Email optionnel via Resend si `RESEND_API_KEY` (retards et échecs seulement, jamais vers les adresses `.example`). Route `/api/cron/speed-check` protégée par `CRON_SECRET` (fermée sans lui).

Les données de démo de la calibration sont **fictives** : l'historique est désormais indépendant de l'horloge (mêmes statistiques tous les jours), avec par construction un critère prédictif et un critère sans effet (zone chez Maintia, effectif chez Orus) et des critères à effectif trop faible.

Parcours de démo en 3 minutes (S3) : 1) admin, Réglages > Email entrant : insérer l'exemple fictif, analyser, créer le lead ; 2) Réglages > Intégrations : connecter (simulation), armer l'incident 401, envoyer un lead depuis sa fiche (échec dans le journal et la cloche), retirer l'incident, renvoyer ; 3) Calibration : lire l'écart par critère, la suggestion et l'aperçu, appliquer puis revenir à la version 1 ; 4) "Voir en tant que" Karim (manager : lecture seule) puis Camille (commercial : accès refusé).

### Configurer l'email entrant (par fournisseur)

Générer la clé dans Réglages > Email entrant, puis renseigner l'adresse affichée. Offres gratuites : **Cloudflare Email Routing et Email Workers** (gratuit, domaine géré par Cloudflare ; code du Worker fourni dans l'écran, bibliothèque `postal-mime`) est la voie à 0 €. SendGrid a supprimé son offre gratuite en 2025 ; Postmark et Mailgun : vérifier que la formule gratuite inclut la réception. Postmark : flux Inbound, Settings, Webhook. Mailgun : Receiving, Routes, action Forward. SendGrid : Inbound Parse, « POST the raw MIME » décoché. Générique (Zapier, n8n) : JSON `{from, subject, text, headers?}`.

### Tâche planifiée (retards)

`/api/cron/speed-check` (GET ou POST, en-tête `Authorization: Bearer <CRON_SECRET>`). **GitHub Actions** (recommandé, gratuit sur dépôt public) : `.github/workflows/speed-check.yml`, toutes les 5 minutes (retards possibles), secrets `PRIORA_URL` et `CRON_SECRET`. **Vercel Cron** : `vercel.json` déclare un passage quotidien car l'offre Hobby limite les crons à une fois par jour, précision à l'heure (à revérifier). En plus, les retards sont détectés à l'affichage de l'application par un manager ou admin (au plus une fois par minute).

## Ce qui est fait (S4 : vitrine et démo publique)

1. **Page d'accueil produit** (`/`, publique) : promesse, bouton « Essayer la démo » (file Maintia en admin, sans compte) et « Voir le cas Orus », fiche lead reproduite en HTML à partir du **vrai moteur** sur un lead fictif (rien n'est saisi à la main), le problème, comment ça marche en 3 étapes, 6 fonctionnalités, la calibration mise en avant (« le score se vérifie sur vos ventes réelles », avec captures réelles de l'appli), stack en une ligne, section « À propos ». Aucun chiffre client, témoignage ou logo : Priora n'a pas de clients.
2. **À remplir avant la mise en ligne** : `src/config/site.ts` (LinkedIn, GitHub, email). Tant que ces champs sont vides, la page affiche « À renseigner dans src/config/site.ts » (aucun faux lien publié).
3. **SEO** : metadata, Open Graph (`src/app/opengraph-image.tsx`, générée), `sitemap.xml`, `robots.txt` (la démo et les API sont exclues), données structurées `SoftwareApplication` sans note, avis ni prix. L'URL canonique vient de `NEXT_PUBLIC_APP_URL` (ou du domaine Vercel de production).
4. **Démo publique** (`PRIORA_PUBLIC_DEMO=true`) : voir ci-dessous.
5. **Visite guidée** (6 étapes : file priorisée, fiche lead, Voir en tant que, tableau de bord, calibration, à vous de jouer) : panneau flottant sans bibliothèque, clavier (Échap pour fermer), mémorisée en `localStorage` (try/catch), relançable par « Visite guidée », désactivable avec `PRIORA_DISABLE_TOUR=true`.
6. **Pages 404 et erreur** soignées (`not-found.tsx`, `error.tsx`, `global-error.tsx`), en-têtes de sécurité et CSP (`next.config.ts`).
7. **Vidéo de démo** : `docs/video-demo.md` (script voix off minuté, découpage, consignes OBS) et `scripts/record-demo.mjs` (enregistrement automatique sans voix).

### Mode démo public (`PRIORA_PUBLIC_DEMO=true`)

- **Un bac à sable par visiteur** : cookie `priora_demo_sid` (UUID aléatoire, httpOnly, posé par `src/proxy.ts`), état en mémoire (`src/lib/demo/sandbox.ts`), expiration après 2 h d'inactivité (`PRIORA_DEMO_TTL_MINUTES`), plafond de 40 bacs à sable (`PRIORA_DEMO_MAX_SESSIONS`, le moins récent est écarté), 260 leads maximum par organisation et par bac à sable, bouton **Réinitialiser la démo** dans le bandeau. Le bandeau annonce le bac à sable personnel.
- **Limite connue de Vercel (serverless)** : la mémoire n'est pas partagée entre instances et peut être recyclée à tout moment. Conséquence : un visiteur peut retrouver la démo dans son état de départ (ses modifications disparaissent, par exemple après une période d'inactivité ou si une autre instance répond). **Sans gravité par construction** : le bac à sable manquant est reconstruit à l'identique (données déterministes), aucune erreur n'est affichée, le cookie et le choix de poste restent valables. Pour un état durable, il faudrait Supabase (V2).
- **Rien ne sort vers l'extérieur** : enrichissement SIREN et lecture de site remplacés par des données fictives (SIREN 999...), IA réelle désactivée (analyse par règles, même avec une clé), emails Resend désactivés, webhook, email entrant et formulaire public répondent 403, tâche planifiée fermée, HubSpot reste le faux HubSpot interne (un par bac à sable). Import CSV limité à 25 lignes par visiteur et sans enrichissement.
- **Limitation de débit** : toutes les actions serveur (45 par minute et par bac à sable, 150 par minute et par IP), création de nouveaux bacs à sable (40 par IP et par 10 minutes, sinon réponse 429 en texte). Limiteur en mémoire donc partiel entre instances (voir limites).
- La démo publique prime sur Supabase : même avec des variables Supabase présentes, aucune donnée réelle n'est exposée.

## Déployer sur Vercel en 5 minutes

Prérequis : le code est dans un dépôt GitHub (public, sans clé ni donnée perso) et vous avez un compte Vercel gratuit (Hobby). Aucune clé n'est nécessaire pour la démo publique.

1. Remplissez `src/config/site.ts` (LinkedIn, GitHub, email) et poussez le code sur GitHub (avec `/commit`).
2. Sur vercel.com : **Add New, Project**, importez le dépôt. Framework détecté : Next.js (le `vercel.json` le précise). Ne changez rien aux commandes de build.
3. Avant de cliquer sur Deploy, **Environment Variables** : ajoutez `PRIORA_PUBLIC_DEMO` = `true`. C'est la seule variable obligatoire. Facultatif : `NEXT_PUBLIC_APP_URL` = l'URL finale (ex. `https://priora.vercel.app`), sinon le domaine de production Vercel est utilisé pour le sitemap et l'aperçu de partage.
4. **Deploy**. Après 1 à 2 minutes, ouvrez l'URL : la page d'accueil s'affiche, « Essayer la démo » ouvre la file Maintia.
5. Vérifiez : la visite guidée se lance, « Voir le cas Orus » fonctionne, un deuxième navigateur (ou une fenêtre privée) ne voit pas vos modifications, `/robots.txt` et `/sitemap.xml` répondent, l'aperçu de partage (collez l'URL dans LinkedIn ou un outil d'aperçu Open Graph) affiche l'image Priora.
6. Domaine personnalisé (facultatif) : Project Settings, Domains. Si vous changez de domaine, mettez à jour `NEXT_PUBLIC_APP_URL` puis redéployez (le sitemap est généré au build).
7. Si vous créez un secret `CRON_SECRET` ou des secrets GitHub plus tard, ce n'est utile qu'en mode Supabase réel : la démo publique n'a pas de tâche planifiée (`vercel.json` n'en déclare plus, le workflow GitHub `speed-check` ne fait rien sans secrets).

Variables d'environnement de la démo publique : `PRIORA_PUBLIC_DEMO` (obligatoire), `NEXT_PUBLIC_APP_URL`, `PRIORA_DEMO_TTL_MINUTES`, `PRIORA_DEMO_MAX_SESSIONS`, `PRIORA_DISABLE_TOUR` (facultatives). Aucune autre clé.

### Qualité vérifiée en fin de S4

- Lighthouse (build de production, Edge headless, `PRIORA_PUBLIC_DEMO=true`) : voir le tableau dans la section Vérifications ci-dessous. `/leads` est volontairement en `noindex` (bac à sable par visiteur) : le critère SEO « page indexable » y est donc en échec par choix.
- Accessibilité : lien « Aller au contenu », focus visible (`:focus-visible` global), contrastes corrigés (`--faint` éclairci en sombre, assombri en clair), libellés ARIA, `prefers-reduced-motion` respecté (animations, défilement de la visite guidée), visite guidée au clavier.
- Passe de sécurité : voir « Sécurité (en place) » (ajouts S4).


## Vérifications S4 (build de production, mode démo public)

Lighthouse 13 (Edge headless, `npx lighthouse`), scores réels :

| Page | Profil | Performance | Accessibilité | Bonnes pratiques | SEO |
| --- | --- | --- | --- | --- | --- |
| `/` | mobile | 97 | 100 | 100 | 100 |
| `/` | desktop | 100 | 100 | 100 | 100 |
| `/leads` | mobile | 98 | 100 | 100 | 63 |
| `/leads` | desktop | 100 | 100 | 100 | 63 |

Le SEO de `/leads` (63) vient d'un choix : l'écran est en `noindex` et exclu par `robots.txt` (c'est un bac à sable par visiteur, pas une page à référencer). Le seul critère en échec est « la page est indexable ».

Autres vérifications : tests vitest (dont isolation des bacs à sable, expiration, réinitialisation, blocage des appels sortants), lint, `tsc`, build ; parcours navigateur (Edge piloté par playwright-core) à 1440 px et 390 px, deux visiteurs isolés (deux contextes, cookies séparés), visite guidée, « Voir le cas Orus », réinitialisation, aucune erreur console, aucun débordement horizontal.

## Mode démo (sans Supabase ni clé IA)

- Variables Supabase absentes : l'appli s'ouvre en **mode démo** avec 30 leads **fictifs** (entreprises inventées, SIREN en 999..., domaines en `.example`), stockés en mémoire, réinitialisés au redémarrage. Bandeau "Données de démonstration" permanent. Pas de connexion requise.
- Clé Anthropic absente : l'analyse est faite par règles et affiche "Analyse IA indisponible, analyse par règles".
- L'enrichissement fait de vrais appels réseau (API gouv, sites web), même en démo.

## Cas Orus (organisation de démo)

Un cas d'étude préparé par Vincent Merpaux pour une candidature chez Orus (poste Sales inbound). **Ce n'est pas un outil officiel d'Orus** : pas de logo ni de charte Orus, le design reste celui de Priora. Les offres et les prix "à partir de" viennent d'informations publiques (orus.eu, consulté le 24/11/2026, susceptibles d'évoluer). Les critères, objections et scripts sont des **hypothèses**, pas le process interne d'Orus. Leads, noms, entreprises, SIREN (999...), téléphones et domaines (`.example`) sont **fictifs**.

- **Sélecteur** : en mode démo, la barre latérale (et l'en-tête sur mobile) propose "Maintia" et "Cas Orus". Lien direct : `/demo/orus` (et `/demo/maintia`), qui mémorise le choix dans un cookie puis ouvre la file de leads. Chaque organisation a sa propre base en mémoire.
- **Bandeau** permanent dans le cas Orus : "Cas d'étude préparé par Vincent Merpaux pour sa candidature chez Orus, à partir d'informations publiques. Leads et chiffres fictifs. Hypothèses, pas le process interne d'Orus."
- **30 leads fictifs** (11 à appeler, 9 à nourrir, 6 à disqualifier, 4 déjà traités dans le pipeline), sources variées : formulaire de devis, devis abandonné, demande de rappel, email, comparateur.
- **Score assurance** (`src/lib/scoring/insurance.ts`), même moteur de règles, 13 critères aux poids éditables dans Réglages : Adéquation 26 (métier couvert, taille 0 à 10, ancienneté), Intention 26 (produit demandé, devis commencé ou abandonné, demande de rappel), Timing 36 (attestation exigée, échéance du contrat, création en cours, fraîcheur), Risques 12 (sinistralité, activité hors cible, mise en concurrence). Les détections reposent sur des mots-clés du message : approximatives par nature. Garde-fou : métier non couvert ou activité hors cible avec un score sous 60 donne "Disqualifier".
- **Script et questions configurables** : `IcpConfig.playbook` (script d'ouverture à variables, 8 questions de découverte, déclencheurs d'objections). Le script suit le style de rappel Orus (vouvoiement, "Madame/Monsieur + nom"). La civilité est déduite du prénom par une liste courte ; si le prénom est inconnu, le script reste neutre.
- **Bibliothèque de 7 objections** au format Acquiescer, Questionner, Rebondir.

Limites : le playbook n'est pas persisté côté Supabase (démo uniquement) et n'a pas d'écran d'édition ; le prompt IA reprend le playbook mais l'appel IA réel n'a pas été testé (pas de clé).

Parcours de démo en 3 minutes : 1) cliquer "Cas Orus", montrer le bandeau et la file (11 / 9 / 6) ; 2) ouvrir Mathieu Roussel (plaquiste, attestation lundi) : verdict, score détaillé justifié, script d'ouverture ; 3) ses objections et questions de découverte, puis la page Objections ; 4) Pipeline (leads gagnés et perdus), et comparer avec Léa Fournier (compare 3 devis, Nourrir) et Patrick Bellanger (hors cible, Disqualifier).

## Lancer en local

```bash
npm install
cp .env.example .env.local   # facultatif : sans valeurs, mode démo
npm run dev                  # http://localhost:3000
npm test                     # tests vitest (moteur de score, CSV, mapping)
npm run lint && npm run build
```

## Variables d'environnement

Voir `.env.example`. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement, jamais préfixée NEXT_PUBLIC_), `INTEGRATIONS_ENCRYPTION_KEY` (32 octets en base64 : `openssl rand -base64 32`, mode Supabase), `CRON_SECRET` (16 caractères minimum), `RESEND_API_KEY`, `RESEND_FROM` (facultatifs), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (défaut `claude-haiku-5-5`), `AI_DAILY_LIMIT_PER_ORG` (défaut 50), `NEXT_PUBLIC_APP_URL`. Démo publique (S4) : `PRIORA_PUBLIC_DEMO`, `PRIORA_DEMO_TTL_MINUTES`, `PRIORA_DEMO_MAX_SESSIONS`, `PRIORA_DISABLE_TOUR` (voir `.env.example`).

## Créer le projet Supabase

1. Créer un projet sur supabase.com (offre gratuite).
2. Project Settings > API : copier l'URL, la clé `anon` et la clé `service_role` dans `.env.local`.
3. Appliquer les migrations, au choix :
   - SQL Editor : exécuter dans l'ordre `supabase/migrations/20260101000000_schema.sql`, `20260101000100_rls.sql`, `20260101000200_functions.sql`, puis `20260201000000_team.sql` (S2 : rôles, attribution, RLS par rôle), puis **`20260301000000_integrations.sql` (S3 : email entrant, intégrations, versions de score, notifications, motif de gain)** ;
   - ou CLI : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.
4. Authentication > URL Configuration : Site URL = `NEXT_PUBLIC_APP_URL`, et ajouter `<URL>/auth/callback` aux Redirect URLs.
5. Facultatif en développement : désactiver "Confirm email" pour tester sans boîte mail. `supabase/seed.sql` ajoute quelques leads fictifs à la première organisation.
6. Créer un compte dans l'appli : l'onboarding crée l'organisation (fonction SQL `create_organization`) et vous en fait admin.

## Sécurité (en place)

- RLS activé sur toutes les tables, isolation par `org_id` (fonctions `is_org_member` / `has_org_role`), trigger de cohérence org/lead.
- Entrées validées côté serveur avec zod (formulaire, webhook, CSV, actions). Pas de clé secrète côté client : le service role n'est utilisé que dans `src/lib/supabase/admin.ts` (`server-only`) pour le formulaire public et le webhook.
- Clé webhook : seul le hash SHA-256 est stocké, la clé n'est affichée qu'une fois.
- Formulaire public : champ piège, consentement obligatoire, limitation de débit par IP et par organisation (en mémoire, voir limites).
- Contenu des leads traité comme non fiable dans le prompt IA (anti injection de prompt), sortie validée par zod, repli par règles si invalide.
- En-têtes : anti-iframe partout sauf `/f/*`. Le service worker ne met en cache aucune page ni donnée.
- **S4** : CSP (`default-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` sauf `/f/*`), HSTS en production, `Permissions-Policy` restreinte, `Referrer-Policy`, `nosniff`, `COOP`. La CSP autorise les scripts et styles inline (hydratation Next.js) : compromis assumé, une CSP à nonce est à étudier en V2. Passe de sécurité S4 : aucune clé secrète dans le code client (le service role n'est lu que dans `src/lib/supabase/admin.ts`), cookies de démo httpOnly, valeur de l'identifiant de session validée (UUID), destination de « Voir en tant que » restreinte aux chemins internes, démo publique plus prioritaire que Supabase, appels sortants coupés en démo publique, workflow GitHub `speed-check` rendu inoffensif sans secrets. Corrigé au passage : un débordement horizontal du pipeline sur mobile et des contrastes insuffisants.

## Budget IA

Une analyse par lead à sa création, conservée en base (versionnée). Plafond quotidien automatique par organisation (`AI_DAILY_LIMIT_PER_ORG`), les imports CSV n'appellent jamais l'IA, relance uniquement manuelle depuis la fiche.

## Hypothèses et limites connues

- Les critères de score sont ceux du moteur (10 règles) : poids et activation éditables, pas de règles personnalisées (S2+).
- La fraîcheur est évaluée à la date de calcul du score (création ou "Réenrichir et recalculer"). La priorité de la file, elle, intègre l'ancienneté en direct.
- Zones : correspondance par texte (région, ville) ou numéro de département, "France" couvre tout. Effectif : tranches INSEE, souvent non diffusé pour les petites structures.
- Le secteur est déduit du code NAF (libellé de division) et du site web, comparé à vos mots-clés.
- Invitation Supabase : crée le compte via `auth.admin.inviteUserByEmail` (clé `SUPABASE_SERVICE_ROLE_KEY` requise côté serveur) et ajoute le membre ; un email déjà inscrit est refusé (un compte = une organisation). **Non testée** faute de projet Supabase.
- Pages interdites : l'interface affiche "Accès réservé" (403 applicatif, noindex) mais le code HTTP reste 200 car la page est diffusée en flux ; aucune donnée n'est envoyée.
- Un commercial ne peut pas importer de CSV (réservé au staff).
- Limiteur de débit en mémoire : par instance serverless, donc partiel. Pour la production, ajouter un limiteur partagé ou le pare-feu Vercel.
- Lecture de site web : filtre SSRF (hôtes publics seulement, redirections revalidées) ; un risque résiduel de DNS rebinding existe, à durcir avant exposition large.
- Le consentement RGPD du formulaire est exigé mais pas encore horodaté en base (S2).
- Modèle IA `claude-haiku-5-5` : **l'appel IA réel n'a pas pu être testé** (pas de clé). Seul le repli par règles a été exercé.
- Supabase réel (RLS, auth, migrations) **non testé** faute de projet : le SQL et la couche repository sont écrits mais jamais exécutés.

## Documents légaux

`/legal/cgu` et `/legal/confidentialite` sont des **modèles provisoires**, à faire relire et valider par un professionnel (RGPD, données de prospects, transfert vers Anthropic).

## Reste à faire

- **S2** : fait (voir ci-dessus). Reste : tester la migration `20260201000000_team.sql` et le RLS sur un vrai projet Supabase, durcir le tour de rôle en concurrence, désigner un commercial senior autrement que par règle.
- **S3** : fait (voir ci-dessus). **Non vérifié** : migration S3 et RLS sur un vrai Supabase, appels réels à HubSpot (jeton, portées, pipeline de transactions par défaut supposé), réception réelle depuis Postmark, Mailgun, SendGrid, Cloudflare (formats écrits d'après leur documentation, testés sur des exemples), envoi Resend réel, exécution GitHub Actions et Vercel Cron. Limites : aperçu de calibration calculé sur les mêmes leads que la suggestion (pas de jeu de validation) ; pas de push web ; pas d'heures ouvrées ; Pipedrive en V2.
- **S4** : fait (voir ci-dessus). **Non vérifié** : déploiement réel sur Vercel (les étapes sont écrites mais pas exécutées), comportement multi-instances en serverless, aperçu Open Graph sur LinkedIn.
- **V2** : état de démo durable (Supabase) ou limiteur partagé (Upstash, pare-feu Vercel), CSP à nonce, push navigateur, heures ouvrées, validation hors échantillon de la calibration, Pipedrive, mesure d'audience respectueuse de la vie privée sur la vitrine.

## Structure

```
src/lib/scoring     moteur de score pur + tests
src/lib/enrichment  API gouv, lecture de site, NAF
src/lib/ai          prompt, schéma zod, repli par règles
src/lib/team        droits, attribution, speed-to-lead, agrégats du tableau de bord (purs, testés)
src/lib/repo        interface + implémentations démo et Supabase
src/lib/demo        leads fictifs, bacs à sable par visiteur (sandbox.ts), constantes démo publique
src/config          site.ts : liens et textes de la vitrine (à renseigner)
src/components/landing  page d'accueil
scripts/            icônes, captures d'écran réelles, enregistrement de la vidéo de démo
docs/               script de la vidéo de démo
src/app             pages, server actions, API webhook
supabase/           migrations SQL et seed
```
