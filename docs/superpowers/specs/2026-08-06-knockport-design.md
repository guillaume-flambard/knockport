# knockport, spec de conception

Date : 2026-08-06
Statut : validée section par section, prête pour le plan d'implémentation

## 1. Ce que c'est

Un portefeuille en terminal. Un recruteur, un hiring manager ou un développeur tape
`ssh knockport.com`, tombe sur un système de fichiers virtuel, et fouille le parcours de
Guillaume Flambard en tapant des commandes. La même expérience existe sur le web, rejouée par
une façade Dioxus compilée en WebAssembly.

L'origine est la candidature Hatchet du 2026-08-05, où `ssh hatchet-jobs.com` remplaçait le
formulaire ATS. Le raisonnement produit complet vit dans la note
`~/Vault/06-Ideas/Repo-native developer hiring.md`.

Ce que le projet doit produire, dans l'ordre :

1. Un objet de candidature qui se distingue, utilisable cette semaine dans les process en cours.
2. Une preuve que le concept marche, avant d'envisager le produit B2B décrit dans la note vault.
3. Un signal exploitable : savoir ce qu'une personne a lu avant de te contacter.

## 2. Non-buts

- Pas de résolution de vraie issue ni de PR par le visiteur. Le travail gratuit est le problème
  éthique identifié dans la note vault, et il reste hors périmètre.
- Pas de classement ni de score des visiteurs. On produit des faits, jamais une note.
- Pas de multi-tenant, pas de génération de parcours par entreprise. C'est le produit B2B, plus tard.
- Pas de compte, pas d'authentification, pas de base de données.

## 3. Architecture

Workspace Cargo, trois crates.

```
content/          markdown + frontmatter, la source de vérité du parcours
crates/
  core/           lib pure, zéro I/O, compile en natif ET en wasm32
  server/         binaire VPS : façade SSH (russh + ratatui) + HTTP (axum)
  web/            app Dioxus 0.7, compile core en WASM
```

Le contrat central :

```rust
pub fn execute(session: &mut Session, content: &Content, input: &str) -> Output;
pub fn complete(session: &Session, content: &Content, partial: &str) -> Vec<String>;
```

`Output` porte des lignes stylées, jamais du texte déjà mis en forme :

```rust
pub struct Output { pub lines: Vec<Line>, pub effect: Option<Effect> }
pub struct Line  { pub spans: Vec<Span> }
pub struct Span  { pub text: String, pub style: Style }
pub enum  Style  { Plain, Dim, Bold, Accent }
pub enum  Effect { Clear, Quit, SubmitContact(ContactPayload), OpenUrl(String) }
```

Ratatui peint `Output` côté SSH, Dioxus le peint en DOM côté web. Une seule vérité pour le
parcours, deux peintres. Les effets sont ce que le core ne peut pas faire lui-même et délègue
à la façade.

`Content` est construit au démarrage depuis les fichiers embarqués au build (`rust-embed`),
mis en cache dans un `OnceLock`. Aucun accès disque à l'exécution, ce qui est aussi ce qui rend
le service sûr : un `ls` chez nous lit une structure en mémoire, ce n'est pas un appel système.

Le core n'exécute jamais rien : pas de shell, pas de `fork`, pas de lecture de fichier hors du
contenu embarqué. La surface d'attaque se réduit à russh et à notre parseur.

Conséquence directe : la façade web n'a **aucun backend** pour l'exploration. Le WASM fait tout,
le bundle se sert en statique, et un pic de trafic ne coûte rien.

## 4. Le parcours

### Système de fichiers virtuel

Monté depuis l'arborescence de `content/`. Chaque fichier est du markdown avec frontmatter :

```yaml
---
title: Phangan.ai
order: 2
hidden: false
---
```

Racine indicative, l'inventaire exact reste à écrire :

```
whoami.md
stack.md
missions/     les missions et le travail client
projects/     les projets, un fichier par projet
writing/      les notes publiques qui valent le détour
.knock        le fichier caché, révélé par ls -a
```

### Commandes

`help`, `ls` (avec `-a`), `cd`, `cat`, `whoami`, `stack`, `cv`, `contact`, `book`, `history`,
`clear`, `exit`.

Complétion par Tab et historique par flèche haut sur les deux façades, sinon l'illusion tombe
au bout de dix secondes. Une commande inconnue répond par une suggestion utile, jamais par une
erreur brute.

### L'énigme

Un seul secret, `.knock`, révélé par `ls -a`. Le lire marque la session et débloque un contenu
qui n'est publié nulle part ailleurs. La récompense n'est jamais le contact : un recruteur
pressé ne doit à aucun moment être bloqué par un jeu.

### Le journal

Chaque session accumule des évènements en mémoire : commande, instant relatif au début, succès
ou échec, énigme trouvée ou non. Ce journal part attaché au message de contact. C'est le
« des preuves, pas des scores » de la note vault, retourné au profit du candidat : tu lis un
message en sachant que la personne a passé quatre minutes sur `missions/phangan.md` avant de
l'écrire.

Côté serveur, un fichier `jsonl` en ajout seul agrège les sessions pour les statistiques. L'IP
n'y est jamais en clair : empreinte salée par déploiement, rétention trente jours.

## 5. Conversion et garde-fous

Trois sorties, toutes dans le terminal.

- **`contact`** ouvre un formulaire en trois questions, nom, mail, message. C'est un mode de la
  session (`Mode::Contact`), donc le core porte la logique et les deux façades la rejouent sans
  code d'interface en double. À la fin, l'effet `SubmitContact` part vers la façade : appel
  direct côté serveur, `POST /api/contact` côté web.
- **`cv`** et **`book`** renvoient tous deux l'effet `OpenUrl`. La façade décide : le web ouvre
  un onglet, le SSH imprime l'URL en clair, parce qu'un terminal distant ne peut ni ouvrir un
  navigateur ni transférer un PDF. Les deux URL sont des valeurs de configuration, le PDF de CV
  étant servi par le même binaire sur `/cv.pdf`.

Validation : forme de l'adresse mail, message entre 10 et 4000 caractères, nom non vide.

Limite de débit : trois envois par heure et par empreinte d'IP, plus un plafond global. C'est le
seul verbe non idempotent du produit, tout le reste est en lecture.

Envoi du mail par SMTP (`lettre`), identifiants par variables d'environnement.

### Accessibilité, non négociable

La note vault est explicite : une friction qui exclut de fait un candidat handicapé est une
discrimination, pas une astuce de filtrage. Donc :

- La façade web rend du HTML sémantique, la sortie dans une région `aria-live="polite"`, le
  focus qui reste sur le champ de saisie, et un vrai `<form>` pour le contact.
- Une page `/profile` sert le contenu intégral, à plat, sans JavaScript et sans jeu. Elle est
  liée depuis l'en-tête du terminal. Elle fait partie du premier lot, pas d'un lot ultérieur.

## 6. Tests

Écrits avant le code.

- **core** : tests unitaires sur le parseur, la sémantique de `cd`, `ls`, `cat`, la découverte de
  l'énigme et la machine à états du contact. Tests d'instantané (`insta`) sur l'`Output` de
  chaque commande, pour figer le rendu exact.
- **contenu** : un test qui balaie `content/`, échoue si un fichier ne parse pas, si un
  frontmatter est invalide, si un lien interne pointe dans le vide, ou si `.knock` a disparu.
  Sans lui le contenu pourrit en silence.
- **server** : test d'intégration sur `/api/contact` avec un envoyeur bidon, et un test qui
  vérifie que la limite de débit mord.
- **web** : la compilation WASM en intégration continue, plus une liste de vérification manuelle
  courte pour le lecteur d'écran.

La façade SSH reste assez fine pour n'avoir presque rien à tester en propre.

## 7. Déploiement

**Cible : un VPS dédié**, séparé de `ovh-echo`. Reconnaissance du 2026-08-06 : `ovh-echo` héberge
echotravel en production plus dev, staging et api, n8n, Grafana, Prometheus, Portainer, weave,
relay, Meilisearch, CloudBeaver, Ollama, Postgres et Redis, sur une seule IP publique avec `sshd`
sur `0.0.0.0:22`. Y poser un serveur SSH maison qui encaisse de l'entrée non fiable reviendrait à
mettre la surface la plus exposée dans la pièce la plus sensible. Machine à part, donc.

Ordre de mise en service, le premier point d'abord :

1. Déplacer `sshd` sur un port haut et **vérifier depuis un second terminal avant de fermer le
   premier**. Console de secours du fournisseur ouverte à côté.
2. `ufw` : autoriser le port haut, 22, 80, 443.
3. Utilisateur `knockport`, sans shell de connexion.
4. Le binaire écoute sur le 22 pour le SSH et sur le 8080 pour le HTTP. Caddy devant pour le TLS
   automatique, cinq lignes de configuration sur une machine neuve.
5. Clé d'hôte SSH générée une fois dans `/var/lib/knockport`, jamais dans git.

Service systemd en bac à sable : `User=knockport`, `AmbientCapabilities=CAP_NET_BIND_SERVICE`,
`NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `PrivateDevices`,
`RestrictAddressFamilies`, `MemoryMax`, `TasksMax`.

Construction : intégration continue qui compile pour `x86_64-unknown-linux-musl`, artefact de
release, déploiement par `scp` puis redémarrage du service. En local, `cargo run` suffit.

DNS : un enregistrement A de `knockport.com` vers le VPS. Le domaine reste à acheter, 11,08 USD
par an chez Porkbun.

## 8. Décisions actées

| Sujet | Décision |
|---|---|
| Nom | knockport, choisi le 2026-08-06 |
| Logo | direction « Sequence », assets dans `brand/` |
| Cible | le portefeuille personnel de Guillaume, pas le produit B2B |
| Façades | core partagé, SSH et web, la web est aussi la voie accessible |
| Expérience | exploration libre plus une énigme unique, jamais bloquante |
| Contenu | markdown dans le dépôt, embarqué au build, pas de lecture du Vault |
| Conversion | `contact` dans le terminal, `cv`, `book` |
| Hébergement | VPS dédié, knockport sur le 22, `sshd` déplacé |

## 9. Questions ouvertes

- Fournisseur et formule du VPS. Ordre de grandeur, 4 EUR par mois chez Hetzner ou OVH.
- Source du PDF de CV, et à quel point il est public.
- URL de prise de rendez-vous.
- Origine des identifiants SMTP.
- Inventaire du contenu : quelles missions, quels projets, et ce qui va dans `.knock`.
