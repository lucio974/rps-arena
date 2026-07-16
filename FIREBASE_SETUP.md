# RPS Arena — Configurer le multijoueur en ligne (Firebase)

Ce guide explique comment créer gratuitement un projet Firebase pour activer le vrai jeu en ligne (matchmaking aléatoire + défis entre amis). Sans cette configuration, l'app fonctionne exactement comme avant, contre des bots simulés — rien n'est cassé si tu sautes cette étape.

Coût : le plan gratuit **Spark** de Firebase suffit largement pour ce jeu (pas de carte bancaire requise).

---

## Étape 1 — Créer le projet Firebase

1. Va sur **https://console.firebase.google.com**
2. Connecte-toi avec un compte Google
3. Clique sur **"Ajouter un projet"** (Add project)
4. Donne-lui un nom, par exemple `rps-arena`
5. Tu peux désactiver Google Analytics (pas nécessaire) → clique **Créer le projet**

## Étape 2 — Ajouter une application Web

1. Sur la page d'accueil du projet, clique sur l'icône **`</>`** ("Web")
2. Donne un surnom à l'app (ex: `rps-arena-web`)
3. **Ne coche PAS** "Configurer Firebase Hosting" (tu utilises déjà GitHub Pages)
4. Clique **Enregistrer l'application**
5. Firebase affiche un bloc de code avec un objet `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`
6. **Copie ces valeurs** — tu en auras besoin à l'étape 5

## Étape 3 — Activer l'authentification anonyme

1. Dans le menu de gauche, va dans **Build → Authentication**
2. Clique **Get started** (ou "Commencer")
3. Onglet **Sign-in method**
4. Clique sur **Anonymous** (Anonyme) dans la liste des fournisseurs
5. Active le bouton, puis **Save**

*(L'app crée un identifiant anonyme unique par joueur — pas besoin de compte email/mot de passe. C'est ce qui sert de "code ami" partageable.)*

## Étape 4 — Activer la Realtime Database

1. Dans le menu de gauche, va dans **Build → Realtime Database**
2. Clique **Create Database**
3. Choisis une région proche (ex: `europe-west1`)
4. Choisis **Start in test mode** pour l'instant (on sécurisera juste après)
5. Clique **Enable**

## Étape 5 — Remplir `firebase-config.js`

Ouvre le fichier `firebase-config.js` livré avec le projet et remplace les valeurs `YOUR_...` par celles copiées à l'étape 2 :

```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "rps-arena-xxxxx.firebaseapp.com",
  databaseURL: "https://rps-arena-xxxxx-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "rps-arena-xxxxx",
  storageBucket: "rps-arena-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

⚠️ Vérifie bien que `databaseURL` correspond exactement à celle affichée dans **Realtime Database** (elle contient parfois la région, ex: `-europe-west1-`).

## Étape 6 — Publier les règles de sécurité

1. Toujours dans **Realtime Database**, va dans l'onglet **Rules**
2. Remplace tout le contenu par celui du fichier `database.rules.json` livré avec le projet
3. Clique **Publish**

Ces règles autorisent uniquement les utilisateurs connectés (même anonymement) à lire/écrire les données de matchmaking, de présence et d'invitations — un visiteur non connecté ne peut rien voir.

*Note : pour un jeu occasionnel comme celui-ci avec authentification anonyme, ces règles offrent une protection raisonnable mais pas un système anti-triche à toute épreuve (un joueur techniquement motivé pourrait théoriquement modifier ses propres écritures avant qu'elles soient validées par l'autre client). Si tu veux blinder ça plus tard, il faudrait passer par des Cloud Functions — hors scope de cette V1.*

## Étape 7 — Redéployer

1. Redéploie tous les fichiers du dossier `rps-arena/` sur GitHub Pages (ou ton hébergeur), y compris les nouveaux fichiers `multiplayer.js` et `firebase-config.js`
2. Ouvre l'app sur ton iPhone (ou dans un navigateur) — en bas de l'écran "Find PvP Match", tu dois voir un point vert **"Online — matched with real players"**
3. Teste en ouvrant l'app sur deux appareils/onglets différents et en lançant "Find Match" sur les deux — ils devraient se matcher directement

---

## Comment ça marche techniquement

- **Matchmaking aléatoire** : chaque joueur qui cherche un match rejoint une file d'attente (`queue`) dans la Realtime Database. Le premier joueur qui trouve un adversaire en attente crée le match.
- **Coups cachés (pierre/papier/ciseaux)** : comme il n'y a pas de serveur, on ne peut pas cacher le coup d'un joueur à l'autre côté serveur. À la place, chaque joueur envoie d'abord un **hash SHA-256** de son coup (engagement), puis, une fois que les deux joueurs ont envoyé leur hash, chacun révèle son vrai coup. Ainsi, aucun des deux ne peut voir le coup de l'autre avant d'avoir lui-même validé le sien.
- **Amis en ligne** : chaque joueur a un "code ami" (son identifiant Firebase anonyme). Partager ce code permet à quelqu'un d'autre de l'ajouter et de voir son statut en ligne en temps réel, puis de lui envoyer une invitation de match.
- **Ce qui reste local/simulé pour l'instant** : les tournois, le classement (leaderboard), et les profils d'adversaires "historiques" restent simulés localement — seul le PvP classé (matchmaking + amis) est réellement en ligne dans cette version.

## Dépannage

- **Le point reste gris "Offline mode"** → vérifie que `firebase-config.js` ne contient plus `YOUR_API_KEY`, et que l'authentification anonyme est bien activée (étape 3).
- **Erreur "permission_denied"** → vérifie que les règles de l'étape 6 ont bien été publiées.
- **Le databaseURL ne fonctionne pas** → copie-le à nouveau depuis Realtime Database → onglet Data, l'URL exacte est affichée en haut de la page.
