# AlgoDash

Dashboard web qui affiche les performances de l'algo de trading (XAUUSD, MetaTrader 5) à partir des données Myfxbook.

## Comment ça marche

1. Toutes les 15 min, une tâche GitHub Actions lance `scripts/fetch_myfxbook.py`.
2. Le script se connecte à Myfxbook, récupère les données de chaque compte, se déconnecte, puis écrit `data/dashboard.json`.
3. Le site est publié sur GitHub Pages. Les pages ne lisent que ce fichier : le navigateur ne parle jamais à Myfxbook.

Les identifiants Myfxbook sont dans les **secrets chiffrés du dépôt GitHub**. Ils ne sont ni dans le code, ni dans le fichier de données, ni dans le navigateur.

> **Attention :** avec GitHub Pages, le site, son code et ses données (numéro de compte, solde, positions) sont **publics**. À revoir avant de passer sur un compte réel.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil |
| `comptes.html`, `calendrier.html`, `liens.html`, `contact.html` | Pages à compléter (titre seul pour l'instant) |
| `css/style.css` | Style commun (couleurs de la maquette en haut du fichier) |
| `js/layout.js` | Barre latérale, page active, menu mobile |
| `js/data.js` | Lecture des données, messages d'erreur, formats (français, heure suisse) |
| `js/accueil.js` | Sélecteur de compte, chiffres clés, courbe, résultats, positions |
| `js/vendor/chart.umd.min.js` | Chart.js 4.4.7, inclus dans le projet |
| `scripts/fetch_myfxbook.py` | Récupération des données Myfxbook |
| `.github/workflows/update-data.yml` | Planification toutes les 15 min et publication |
| `.env.example` | Modèle de configuration locale |

## Lancer sur ton PC

Il faut seulement Python (déjà installé). Dans le dossier du projet :

```bash
python scripts/fetch_myfxbook.py --sample
```

```bash
python -m http.server 8765
```

Puis ouvre <http://localhost:8765>. La première commande crée des données d'exemple ; un bandeau le rappelle en haut de la page. Ouvrir `index.html` par double-clic ne marche pas : le navigateur refuse alors de lire le fichier de données.

### Tester avec tes vraies données

1. Copie `.env.example` en `.env`.
2. Remplis `MYFXBOOK_EMAIL`, `MYFXBOOK_PASSWORD` et `BROKER_TIMEZONE`.
3. Lance :

```bash
python scripts/fetch_myfxbook.py
```

Le fichier `.env` est ignoré par git : il ne part jamais sur GitHub.

## Configuration

| Réglage | Où | Valeur |
|---|---|---|
| `MYFXBOOK_EMAIL` | Secret GitHub (ou `.env`) | E-mail du compte Myfxbook |
| `MYFXBOOK_PASSWORD` | Secret GitHub (ou `.env`) | Mot de passe Myfxbook (pas une connexion Google ou Facebook) |
| `BROKER_TIMEZONE` | Variable GitHub (ou `.env`) | Fuseau du broker : décalage en heures (`3`) ou nom (`Europe/Athens`) |

`BROKER_TIMEZONE` sert à convertir les heures des positions en heure suisse. Pour le trouver, compare l'heure affichée dans MT5 (fenêtre « Observation du marché ») à l'heure UTC. Avec un décalage en heures, il faut le corriger aux changements d'heure ; avec un nom de fuseau, c'est automatique.

## Mettre en ligne sur GitHub

1. Crée un compte GitHub et installe [git](https://git-scm.com/download/win) (ou GitHub Desktop).
2. Crée un dépôt **public** vide, par exemple `algodash`.
3. Dans **Settings → Secrets and variables → Actions** :
   - onglet **Secrets** : ajoute `MYFXBOOK_EMAIL` et `MYFXBOOK_PASSWORD` ;
   - onglet **Variables** : ajoute `BROKER_TIMEZONE`.
4. Dans **Settings → Pages**, choisis **Source : GitHub Actions**.
5. Envoie le projet (remplace `TON-COMPTE`) :

```bash
git init -b main
```

```bash
git add .
```

```bash
git commit -m "AlgoDash"
```

```bash
git remote add origin https://github.com/TON-COMPTE/algodash.git
```

```bash
git push -u origin main
```

6. Dans l'onglet **Actions**, attends la fin de la tâche « Mettre à jour les données et publier ». L'adresse du site apparaît dans **Settings → Pages**.

La tâche repart ensuite toute seule toutes les 15 min. GitHub la lance souvent avec 5 à 30 min de retard.

## Mettre à jour le dashboard

Modifie les fichiers, puis :

```bash
git add .
```

```bash
git commit -m "Description du changement"
```

```bash
git push
```

Le site est republié automatiquement. Pour forcer un rafraîchissement des données : onglet **Actions**, tâche « Mettre à jour les données et publier », bouton **Run workflow**.

## Messages d'erreur

| Message sur le dashboard | Cause | Que faire |
|---|---|---|
| Connexion à Myfxbook refusée | E-mail ou mot de passe faux | Corriger les secrets GitHub |
| Myfxbook limite temporairement les requêtes | Trop d'appels | Attendre, la tâche réessaie seule |
| Myfxbook est indisponible | Panne ou coupure réseau | Attendre, la tâche réessaie seule |
| Myfxbook refuse la connexion du serveur | Myfxbook bloque les serveurs de GitHub | Changer de plateforme (voir avec Claude) |
| Configuration incomplète | Secrets absents | Ajouter les secrets GitHub |
| Les données n'ont pas été rafraîchies depuis… | La tâche planifiée ne tourne plus | Vérifier l'onglet Actions |

En cas d'échec, le dashboard continue d'afficher les dernières données connues, avec leur date. Le détail de chaque passage est dans l'onglet **Actions** du dépôt.

## À savoir

- Myfxbook ne fournit qu'un point par jour : la courbe « 1J » est construite à partir des positions fermées du jour.
- Les résultats jour / semaine / mois viennent de Myfxbook et sont découpés à l'heure du broker.
- GitHub coupe les tâches planifiées d'un dépôt inactif depuis 60 jours. La tâche crée un petit commit tous les 30 jours pour l'éviter.
