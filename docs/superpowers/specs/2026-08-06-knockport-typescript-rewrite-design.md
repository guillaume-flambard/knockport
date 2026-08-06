# knockport, réécriture TypeScript

Date : 2026-08-06
Statut : validée section par section, prête pour le plan d'implémentation
Remplace : les sections 3, 6 et 7 de `docs/superpowers/specs/2026-08-06-knockport-design.md`

## 1. Pourquoi cette réécriture

La première implémentation était un workspace Cargo à trois crates, avec une façade web en
Dioxus 0.7 compilée en WebAssembly. Elle fonctionne, elle est testée, et elle est trop lourde
pour ce qu'elle rend.

Mesures prises sur le dépôt le 2026-08-06 :

| | crates compilés, cible `wasm32-unknown-unknown` |
|---|---|
| `knockport-core` seul | 42 (arêtes normales) |
| `knockport-web` avec Dioxus | **151** |

Dioxus ajoutait une centaine de crates pour peindre un `<pre>` et un `<input>`. Partaient dans
le bundle : `objc2` et `objc2-encode` (bindings Objective-C macOS), `memmap2`, `libloading`,
`tungstenite` (serveur WebSocket, pour le hot-reload), `subsecond` (moteur de hot-patching),
`globset`, `tracing-subscriber`, `euclid`, `keyboard-types`, `parking_lot`. Plus six doublons de
versions traînés en parallèle : `const-serialize` 0.7 et 0.8-alpha, `digest` 0.10 et 0.11,
`crypto-common`, `block-buffer`, `cpufeatures`, `rustc-hash`.

Conséquences observées : `target/` à 6,6 Go pour 188 Ko de source, 32 s de reconstruction à
chaud, un commit de retour arrière sur la version de la CLI (`7100329`), et un gestionnaire de
soumission recopié deux fois dans `crates/web/src/terminal.rs` (`onsubmit` et `onkeypress`,
30 lignes identiques), signe classique de bagarre avec le modèle d'événements du framework.

Retirer seulement Dioxus aurait ramené le compte à environ 50 crates. Le plancher restant
n'était pas `wasm-bindgen` mais le core lui-même : `rust-embed` et `gray_matter` amènent à eux
deux une trentaine de crates pour faire, **au démarrage du navigateur**, un travail connu **à la
compilation** (lire des fichiers figés, parser du YAML figé). Les en sortir demandait un
`build.rs` et une refonte de `core`.

## 2. Le critère qui a tranché la stack

Le différenciateur du produit est `ssh knockport.com`. Sans lui, knockport est un portfolio en
style terminal parmi des milliers. La question n'est donc pas « quelle stack web » mais :

> quelle stack fait tourner le même parcours dans un serveur SSH et dans un navigateur, sans
> écrire la logique deux fois.

- **Rust** doit passer par WASM pour atteindre le navigateur : une frontière, du glue code,
  `wasm-bindgen`, `wasm-opt`, une chaîne de build.
- **Go** (`charmbracelet/wish` plus `bubbletea` est la meilleure brique existante pour une app
  accessible en SSH) compile en une seconde et produit un binaire statique, mais Go vers WASM
  pèse plusieurs mégaoctets. Il force soit à réécrire le core en TypeScript, soit à passer par
  WebSocket.
- **TypeScript** est le seul des trois où « un core, deux peintres » ne coûte rien : le même
  fichier tourne dans Node et dans le navigateur, importé directement.

La scalabilité n'a pas été un critère. Un portfolio fait quelques centaines de visites, aucune
de ces stacks ne plie là-dessus. Les contraintes réelles sont : livrable rapidement, un seul
mainteneur, doit survivre à six mois d'abandon, doit démontrer la compétence que les entreprises
en cours de process achètent effectivement.

## 3. Décisions actées

| Sujet | Décision |
|---|---|
| Langage | TypeScript partout, un seul core partagé |
| Runtime serveur | Node 24, exécution native du TS par type stripping, aucune étape de build |
| Monorepo | pnpm workspaces, 3 paquets, pas de turbo |
| Build web | esbuild, une commande, sans fichier de configuration |
| Tests | vitest |
| SSH | `ssh2` |
| HTTP | `hono` |
| Mail | `nodemailer` (remplace `lettre`) |
| Empreinte IP | `sha256` via `node:crypto` (remplace `blake3`) |
| Contenu | généré à la compilation, zéro dépendance de parsing |
| Direction visuelle | fenêtre de terminal posée, traitement sobre |
| Typographie | IBM Plex Mono, une graisse, woff2 sous-ensemblé, auto-hébergée |
| Thème | clair et sombre via `prefers-color-scheme`, sans bouton |
| Déploiement | un VPS, un processus, `scp` plus `systemctl restart` |

Outillage complet, la liste entière : `pnpm`, `esbuild`, `vitest`, `ssh2`, `hono`, `nodemailer`.

## 4. Ce qui ne change pas

Les sections 1, 2, 4 et 5 de la spec du 2026-08-06 restent la référence et ne sont pas recopiées
ici : ce qu'est le produit, les non-buts, le système de fichiers virtuel, les commandes,
l'énigme `.knock`, le journal de session, la conversion (`contact`, `cv`, `book`), les règles de
validation, la limite de débit et les exigences d'accessibilité. Elles ne dépendent pas du
langage.

`content/` et `brand/` ne bougent pas.

## 5. Architecture

```
packages/
  core/     TS pur, zéro dépendance runtime.
            Session, parseur, FS virtuel, complétion, contact. Le parcours, rien d'autre.
  server/   Node 24. ssh2 (port 22) + Hono (HTTP, contact, /profile, statique).
            ansi.ts et editor.ts : comment des octets deviennent un terminal.
  web/      ~150 lignes de DOM, le CSS, la fonte. Importe core.
content/    inchangé
brand/      inchangé
scripts/
  gen-content.mjs   parcourt content/, produit packages/core/src/content.generated.ts
```

La frontière entre `core` et `server` est celle du Rust, conservée volontairement : `core` porte
le parcours, `server` porte la façon dont des octets deviennent un terminal. `ansi.ts` et
`editor.ts` sont de la logique pure mais ne servent que le SSH, ils restent donc dans `server`.

Node 24 exécute le TypeScript nativement (type stripping, stable depuis 23.6), donc
`node packages/server/src/main.ts` suffit : pas de `tsx`, pas de `ts-node`, pas de compilation
côté serveur. Le navigateur ne sait pas lire du TS, d'où esbuild, seule dépendance de build.

## 6. Le core

### Types

Les enums Rust deviennent des unions discriminées, exhaustivement vérifiables au `switch` avec
un cas `never`.

```ts
export type Style  = 'plain' | 'dim' | 'bold' | 'accent'
export type Span   = { text: string; style: Style }
export type Line   = { spans: Span[] }

export type Effect =
  | { kind: 'clear' }
  | { kind: 'quit' }
  | { kind: 'openUrl';       url: string }
  | { kind: 'submitContact'; payload: ContactPayload }

export type Output = { lines: Line[]; effect?: Effect; failed: boolean }

export type Event          = { atMs: number; input: string; ok: boolean }
export type ContactPayload = { name: string; email: string; message: string
                               journal: Event[]; eggFound: boolean }
export type ContactStep    = 'name' | 'email' | 'message'
export type Mode = { kind: 'normal' }
                 | { kind: 'contact'; step: ContactStep; draft: { name: string; email: string } }
export type Session = { cwd: string[]; mode: Mode; history: string[]
                        journal: Event[]; eggFound: boolean }
```

`failed` reste porté explicitement et n'est jamais déduit du texte rendu, pour la raison déjà
documentée dans le code Rust : renifler la sortie casserait à la première reformulation d'un
message.

### Contrat

```ts
export function execute(s: Session, c: Content, input: string, atMs: number): Output
export function complete(s: Session, c: Content, partial: string): string[]
export function prompt(s: Session): string
```

`execute` mute la `Session` sur place, ce qui reproduit exactement le `&mut Session` du Rust et
garde le port mécanique.

### Contenu généré à la compilation

`scripts/gen-content.mjs` parcourt `content/`, parse les trois champs de frontmatter (`title`,
`order`, `hidden`) et écrit `packages/core/src/content.generated.ts`. Le parseur de frontmatter
est écrit à la main : trois champs, une quinzaine de lignes, aucune dépendance même au build.

Le fichier généré est commité, pour qu'un clone frais compile sans étape préalable, et
régénéré par `pnpm build`. Un test vérifie qu'il est à jour par rapport à `content/`.

Conséquence : aucun parsing au démarrage, ni sur le serveur ni dans le navigateur. C'est le gain
qui aurait demandé un `build.rs` côté Rust.

## 7. La façade web

### Le peintre

Environ 150 lignes : rendu des lignes et des spans, saisie (Entrée, Tab pour la complétion,
flèches haut et bas pour l'historique), aiguillage des effets.

L'historique à la flèche haut est une correction, pas une nouveauté : la spec le promettait sur
les deux façades, le SSH l'avait, la façade Dioxus ne l'a jamais implémenté.

Aiguillage des effets côté web : `clear` vide le scrollback, `openUrl` ouvre un onglet,
`submitContact` fait un `POST /api/contact`, `quit` imprime une ligne de fin.

### Sécurité du rendu

Le rendu passe **exclusivement par `textContent`, jamais `innerHTML`**. Le contenu vient du
dépôt, mais le mode contact réaffiche la saisie du visiteur dans le scrollback : un
`your name> <img onerror=...>` serait sinon exécuté. `textContent` rend le problème inexistant
par construction, plutôt que par échappement.

### Design system

Direction retenue : fenêtre de terminal posée sur un fond travaillé, traitement sobre. Barre de
chrome, trois pastilles grises unies (pas de rouge, jaune, vert, qui font capture d'écran de
tutoriel), titre `guillaume@knockport: ~`, ombre portée, dégradé radial derrière.

```css
:root {
  --bg:#0b0d0e; --fg:#e8e6e1; --dim:#7d8285; --accent:#7fd6d1;
  --stage: radial-gradient(115% 80% at 50% 0%, #171c1e 0%, #0a0c0d 70%);
  --chrome:rgba(232,230,225,.045); --dot:#3d4447; --edge:rgba(232,230,225,.10);
}
@media (prefers-color-scheme: light) {
  :root { --bg:#fbfaf8; --fg:#14171a; --dim:#6b7175; --accent:#0f6f77;
          --stage: radial-gradient(115% 80% at 50% 0%, #fff 0%, #e6e4dd 75%);
          --chrome:rgba(20,23,26,.035); --dot:#c4c1b9; --edge:rgba(20,23,26,.10); }
}
```

Tout le décor est exprimé en variables, donc le mode clair coûte le bloc ci-dessus et rien de
plus. Pas de bouton de bascule : un contrôle non-terminal dans une page qui n'est que du
terminal, pour un réglage que le système exprime déjà.

**Typographie.** IBM Plex Mono, une seule graisse. `Style::Bold` n'est utilisé qu'une fois dans
tout le core (le mot « commands » dans `help`), donc la synthèse du navigateur suffit et un
second fichier ne se justifie pas. Sous-ensemble ASCII plus latin-1, woff2, environ 26 Ko,
auto-hébergée dans `packages/web/assets`, déclarée en `<link rel="preload">`.
`font-display: optional`, pas `swap` : un reflow de fonte sur une page entièrement monospace se
voit immédiatement.

**Responsive.** Sous 768 px la fenêtre perd son cadre et prend tout l'écran, la barre de titre
devenant un bandeau fin fixé en haut. Une fenêtre dans une fenêtre gaspille l'écran d'un
téléphone. Hauteurs en `dvh` et non `vh`, pour que la saisie reste visible au-dessus du clavier
virtuel.

**Mouvement.** Le curseur bloc clignote. Les nouvelles lignes apparaissent sans animation : un
fondu sur du texte à lire fatigue. Tout est coupé sous `prefers-reduced-motion: reduce`.

### Accessibilité

Reprise telle quelle de la spec précédente, elle était juste.

- Scrollback en `aria-live="polite"`, `aria-atomic="false"`
- Un vrai `<form>`, un `<label>` lié au champ, focus qui revient sur la saisie après chaque
  commande
- Lien d'évitement vers `/profile` en premier élément focusable
- `/profile` sert le contenu complet, à plat, sans JavaScript, dans les deux modes de couleur.
  Elle fait partie du premier lot.

## 8. La façade SSH

Serveur `ssh2`. Clé d'hôte générée une fois dans `/var/lib/knockport`, jamais dans git.
Authentification `none` acceptée, pour que `ssh knockport.com` entre sans rien demander.

Sur une `session`, on accepte `pty` et `shell`. On **refuse** `exec`, `sftp`, `subsystem`, `x11`,
le port forwarding et l'agent forwarding. Plafonds sur le nombre de sessions concurrentes et sur
la durée d'une session.

Le décodage UTF-8 à état, qui avait coûté un commit puis un commit de correction côté Rust
(`42f291e`, `97d8967`), est assuré par `new TextDecoder('utf-8')` avec `{ stream: true }`. Rien
à écrire.

`ansi.ts` (styles vers séquences SGR) et `editor.ts` (retour arrière, flèches, Ctrl-C, Ctrl-D,
Tab) se translittèrent depuis les fichiers Rust correspondants. Logique pure, déjà testée.

### Contrepartie assumée

`ssh2` en mode serveur est moins éprouvé que `russh`, et il est exposé sur le port 22 face à
internet. C'est le vrai coût du changement de langage. Mitigations, dans le premier lot :

- refus de tout canal autre que `shell` et `pty` (ci-dessus)
- le core ne fait ni `fork`, ni `exec`, ni lecture de fichier hors du contenu généré
- utilisateur `knockport` sans shell de connexion
- port 22 obtenu par `AmbientCapabilities=CAP_NET_BIND_SERVICE`, jamais en root
- bac à sable systemd : `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`,
  `PrivateDevices`, `RestrictAddressFamilies`, `MemoryMax`, `TasksMax`

## 9. HTTP

Hono sert le statique, `/profile`, `/cv.pdf` et `POST /api/contact`.

Les comportements de `ratelimit.rs` et `journal.rs` sont portés avec les corrections qu'ils ont
déjà reçues : retrait des entrées expirées pour éviter la croissance non bornée, balayage
seulement au-delà d'un seuil, comptage de tous les appels autorisés, validation de la taille du
journal (plafond à 500 évènements). Les tests qui épinglent ces comportements sont portés aussi.

Validation du contact : forme de l'adresse, message entre 10 et 4000 caractères, nom non vide.
Limite : trois envois par heure et par empreinte d'IP, plus un plafond global. L'IP n'apparaît
jamais en clair : empreinte salée par déploiement, rétention trente jours.

Le rejet de l'injection d'en-tête par retour à la ligne dans le nom d'affichage, testé côté
Rust contre `lettre`, doit être re-testé contre `nodemailer`, dont le comportement peut différer.

## 10. Tests

- **core** : parseur, sémantique de `cd`, `ls`, `cat`, découverte de `.knock`, machine à états du
  contact
- **snapshots** : `toMatchSnapshot()` remplace `insta`. Les 3 snapshots Rust existants servent
  d'**oracle** : le port n'est validé que si la sortie TypeScript leur est identique au caractère
  près. C'est le garde-fou mécanique de toute la migration.
- **contenu** : balayage de `content/`, échec si un frontmatter est invalide, si un lien interne
  pointe dans le vide, si `.knock` a disparu, ou si `content.generated.ts` est désynchronisé
- **HTTP** : `app.request()` de Hono, en mémoire, sans réseau. Contact avec un envoyeur bidon,
  limite de débit qui mord, rejet de l'injection d'en-tête
- **SSH** : test d'intégration qui se connecte avec le client `ssh2` contre le serveur, tape
  `ls`, vérifie la sortie. Absent de la version Rust, simple à obtenir ici.

## 11. Build et déploiement

```bash
pnpm dev     # node --watch sur le serveur + esbuild --watch sur le web
pnpm test    # vitest
pnpm build   # gen-content, puis esbuild, puis copie des assets
```

```bash
esbuild packages/web/src/main.ts --bundle --minify --outfile=dist/app.js
```

Aucun fichier de configuration esbuild.

Déploiement : `scp` du dist et des paquets, puis `systemctl restart`. Un VPS dédié, séparé de la
machine qui héberge la production existante, pour la raison déjà établie dans la spec précédente
(un serveur SSH maison qui encaisse de l'entrée non fiable n'a pas sa place dans la machine la
plus sensible). Caddy devant pour le TLS. L'ordre de mise en service du VPS reste celui de la
section 7 de la spec précédente, à commencer par le déplacement de `sshd` sur un port haut,
vérifié depuis un second terminal avant de fermer le premier.

Le CDN est une optimisation pour un trafic qui n'existe pas encore, hors périmètre.

## 12. Ordre de bascule

Le point de non-retour est volontairement tardif : le Rust reste fonctionnel jusqu'à la dernière
étape, et l'on peut s'arrêter à n'importe quel palier sans rien casser.

1. `git tag v0-rust`
2. `packages/core` porté, tests verts, snapshots identiques au Rust
3. `packages/web` plus le design validé
4. `packages/server` : Hono, contact, `/profile`, statique
5. `packages/server` : façade `ssh2`
6. Vérification de parité sur les deux façades, déploiement
7. Un seul commit qui supprime `crates/`, `Cargo.toml` et `Cargo.lock`

## 13. Chiffrage

En jours de travail concentré, pas en jours calendaires.

| Étape | Coût |
|---|---|
| core porté plus tests | 0,5 j |
| web plus design | 1 j |
| HTTP, contact, profile | 0,5 j |
| façade SSH | 1 j |
| parité, déploiement | 0,5 j |
| **total** | **~3,5 j** |

## 14. Questions ouvertes

Héritées de la spec précédente, aucune n'est bloquante pour commencer le lot 1 :

- Fournisseur et formule du VPS. Ordre de grandeur, 4 EUR par mois.
- Source du PDF de CV, et à quel point il est public.
- URL de prise de rendez-vous, pour l'effet `openUrl` de `book`.
- Origine des identifiants SMTP.
- Inventaire du contenu : quelles missions, quels projets, et ce qui va dans `.knock`.

Ajoutée par cette spec :

- Le nom de domaine `knockport.com` reste à acheter. Le `ssh knockport.com` affiché dans
  l'interface en dépend.
