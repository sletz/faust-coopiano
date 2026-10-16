# coopiano face à Pianoteq

Mesures comparées de coopiano (le modèle C++ que ce dépôt porte en Faust) et de
Pianoteq 9, sur les mêmes fichiers MIDI, rendus hors ligne et à sec. Chiffres
complets : [`results.txt`](results.txt). Scripts : `scripts/pianoteq_*.py|sh`
(voir « Reproduire »).

Pianoteq n'est pas un piano de référence : c'est un autre modèle physique, fermé.
Un écart dit donc où les deux modèles font des choix différents, pas lequel a
raison. Là où un jugement demanderait un vrai piano, ce document le dit.

## En bref

| | coopiano | Pianoteq | |
|---|---|---|---|
| Dynamique v=20 → 127, A0–C4 | 25–35 dB | 26–29 dB | comparable |
| Dynamique v=20 → 127, aigu (A5–C8) | 46–55 dB | 24–30 dB | l'aigu doux de coopiano est presque muet |
| Brillance avec la vélocité | plafonne vers v=64 | croît jusqu'à 127 | le grave fortissimo de coopiano reste sombre |
| Inharmonicité B, grave (A0–C3) | 1,2–2,5 × Pianoteq | | |
| Inharmonicité B, aigu (A3–C7) | | 1,2–1,9 × coopiano | |
| Accord étiré, A0 | −30 cents | −15 cents | médium et aigu semblables |
| T60 du fondamental, médium (A3–A4) | 25–31 s | 24–34 s | comparable |
| T60 du fondamental, extrême grave (A0, C1) | ~90 s | ~30 s | |
| Étouffoirs : chute de 40 dB | 0,2–0,4 s | 0,5–0,8 s (1,1–1,4 s en A5–C6) | |
| Pédale : halo des cordes libérées | | 17–25 dB plus fort | |
| Stéréo sur la musique | corrélation 0,44, −1,4 dB en mono | 0,43, −1,5 dB | identique |
| Rendu hors ligne, cette machine | 6–8 × le temps réel | 12–36 × | Pianoteq 2–5 × plus rapide |

## Ce qui est comparé

- **coopiano** : le programme C++ d'origine (`../../coopiano`, commit `bba9e06`),
  réverbération coupée (`GP_NO_REVERB=1`), vélocité = MIDI / 127 comme dans son
  rendu de fichiers MIDI. Un seul changement : son écriture WAV produit des
  flottants 32 bits au lieu d'entiers 16 bits (`scripts/coopiano_float_wav.py`,
  voir « En passant » plus bas). La normalisation par fichier (crête à 0,89) est
  conservée : seuls les niveaux relatifs ont un sens.
- **Pianoteq 9.2.5, version d'essai**, preset « NY Steinway D Classical » avec sa
  réverbération, son délai (effet 1) et son limiteur coupés
  (`scripts/pianoteq_preset.sh`, par le serveur JSON-RPC de Pianoteq). Ses
  égaliseurs et son mélange de quatre micros sont gardés : ils font partie du son
  du preset. La version d'essai verrouille les paramètres physiques (non modifiés
  ici) et rend muettes huit touches noires (F#2 G#2 A#2 C#6 D#6 F#6 G#6 A#6) ; les
  touches mesurées sont des do et des la, toutes jouées.
- **Mêmes partitions** (`scripts/pianoteq_midi.py`) :
  - `notes.mid` : seize touches (do et la de A0 à C8), six vélocités (20 à 127),
    tenues 5 s ;
  - `decay/` : les mêmes touches à v=90, tenues 15 s, une par fichier ;
  - `pedal.mid` : une note piquée, pédale levée puis enfoncée ;
  - `demo.mid` (la démo de coopiano) et `prelude.mid` (Bach, BWV 846,
    mesures 1–11), pour la stéréo et l'écoute.

  Les deux rendent à 44,1 kHz, Pianoteq par `--headless --midi … --wav …`.

Toutes les mesures portent sur la puissance des deux canaux additionnée : les
micros espacés de Pianoteq ne creusent donc pas de filtres en peigne dans une
somme mono. **Validation de la méthode** : sur coopiano, dont on connaît le
modèle, l'estimateur retrouve l'inharmonicité B de chaque touche à 5 % près
de A0 à A7, et le désaccord à 1 cent près jusqu'à C6 (fig. 1, pointillés).

## Résultats

### 1. Inharmonicité et accord

![Inharmonicité et accord](fig_inharmonicity.png)

Les deux courbes ont la même forme : un creux dans le grave (vers A1–C2), puis
une montée régulière vers l'aigu. Mais
les cordes graves de coopiano sont plus raides (B 1,2 à 2,5 fois celui de
Pianoteq de A0 à C3), et ses cordes aiguës moins raides (Pianoteq 1,2 à 1,9 fois
plus de A3 à C7). L'accord étiré suit : coopiano descend à −30 cents en A0,
Pianoteq à −15 ; dans l'aigu, les deux montent ensemble (+15 cents en A7).
Laquelle est la plus proche d'un Steinway D réel, ces mesures ne le disent pas.

### 2. Dynamique

![Niveau selon la vélocité](fig_dynamics.png)

De A0 à C4, les deux couvrent 25 à 35 dB de v=20 à v=127. Pianoteq garde cette
étendue sur tout le clavier (24 à 31 dB). Celle de coopiano
s'élargit vers l'aigu : 46 dB en A5, 55 dB en C8, où la note la plus douce est à
−67 dB du do central à v=90 (Pianoteq : −31 dB).

Les données du marteau de coopiano (`build/ref/strike.txt`) donnent une raison
probable : à vélocité 0,17, le feutre reste au contact de la corde 0,62 ms en C8,
soit 2,6 périodes de la note, et 2 ms en C6, soit 2 périodes. Une impulsion plus
longue que la période n'excite presque plus le fondamental. Pianoteq dose
visiblement sa réponse pour garder l'aigu jouable doucement. La loi vélocité →
vitesse du marteau de coopiano (6 m/s × v^1,8, `[hammer] maximum_velocity_mps` et
`velocity_exponent` de `default.ini`) est un levier possible ; en direct,
`GP_VEL_GAMMA` agit déjà en amont.

### 3. Brillance

![Centroïde spectral selon la vélocité](fig_brightness.png)

Centroïde spectral des 0,2 premières secondes, en multiples du fondamental.
Celui de Pianoteq croît de pianissimo à fortissimo (A0 : de 4,8 à 26 ; C2 : de
2,7 à 7,6 ; C4 : de 1,1 à 2,6). Celui de coopiano s'arrête vers v=64 (A0 : 8 ;
C2 : 3,2 ; C4 : 2,3). Au-dessus, la note devient plus forte sans devenir plus
claire.

Là encore, le marteau l'explique : en C2, le contact dure 3,41 ms à vélocité
0,52 et encore 3,13 ms à 1,0, alors que la force crête est multipliée par cinq.
L'impulsion ne raccourcit plus, donc le spectre ne s'élargit plus. Sur la figure suivante, en
C2 fortissimo, Pianoteq garde ses partiels 10 à 20 entre −8 et −26 dB du plus
fort, coopiano entre −19 et −36 dB.

![Amplitudes des partiels](fig_partials.png)

### 4. Décroissance et étouffoirs

![Décroissances et relâchements](fig_decay.png)

Les deux ont une décroissance en deux temps (rapide puis lente). Dans le médium,
les temps se rejoignent : T60 du fondamental de 31 et 24 s en C4, de 25 et 26 s
en A4. Les fondamentaux de l'extrême grave de coopiano tiennent bien plus
longtemps (A0 et C1 : environ 90 s, contre 30 s pour Pianoteq). Ils tiennent même
plus que la valeur que le modèle leur donne (63 s), peut-être par leur couplage
aux autres cordes et à la table (non vérifié). Les partiels 2 à 4 sont plus
proches.
Toutes ces valeurs sont des pentes ajustées sur 15 s, battements compris : à
lire comme des ordres de grandeur au-delà de 30 s.

Les étouffoirs de coopiano coupent plus vite : 0,2 à 0,4 s pour perdre 40 dB,
contre 0,5 à 0,8 s pour Pianoteq, et 1,1 à 1,4 s en A5–C6. Au-dessus des derniers
étouffoirs (F6 pour coopiano, G6 pour Pianoteq), les deux s'éteignent seuls, en
0,9 à 1,8 s.

![Spectrogrammes](fig_spectrograms.png)

### 5. Pédale et résonance sympathique

Une note piquée (v=90, relâchée après 0,15 s), pédale levée puis enfoncée :

| touche | queue 1–4 s, pédale levée | queue, pédale enfoncée | halo, pédale enfoncée |
|---|---|---|---|
| C2 | −74,9 / −54,1 dB | −9,5 / −10,5 dB | −47,3 / −28,6 dB |
| C3 | −78,3 / −55,2 | −14,3 / −14,6 | −42,7 / −25,7 |
| C4 | −71,3 / −58,3 | −15,3 / −16,6 | −43,6 / −24,8 |
| C5 | −67,2 / −60,3 | −18,9 / −20,2 | −42,6 / −21,3 |
| C6 | −84,1 / −58,3 | −27,4 / −32,2 | −32,8 / −8,2 |

(coopiano / Pianoteq ; queue relative à l'attaque.)

Pédale enfoncée, les deux soutiennent la note autant l'un que l'autre. Le
« halo », lui, est l'énergie aux fondamentaux des touches qui ne sont pas des
partiels de la note : les cordes que la pédale libère et que la table fait
vibrer. Il est 17 à 25 dB plus fort chez Pianoteq. Pédale levée, la note étouffée
de coopiano est aussi bien plus silencieuse (−67 à −84 dB contre −54 à −60).
Pianoteq laisse plus de résonance traîner.

### 6. Stéréo

Sur la musique, les deux images sont équivalentes : corrélation G/D de 0,44 et
0,43 sur le prélude, et 1,4 et 1,5 dB perdus en sommant en mono. Note par note,
coopiano place le grave à gauche (+2 dB) et l'aigu à droite (−5 à −7 dB), comme
le pianiste l'entend. Le mélange de micros du preset « Classical » de Pianoteq
reste près du centre, avec des écarts d'une touche à l'autre.

### 7. Coût

En rendu hors ligne sur cette machine (Apple M5), les deux presque sur un seul
cœur, Pianoteq va 36 fois plus vite que le temps réel sur des notes seules et
12 à 17 fois sur la musique (son démarrage, environ 0,8 s, compris). coopiano va
6 à 8 fois plus vite que le temps réel. Pianoteq est donc 2 à 5 fois plus
rapide. L'essentiel du coût de coopiano est sa table (732 modes, imagée par
région) et son registre sympathique, calculés en permanence : en temps réel,
une voix coûte 3 % d'un cœur et le corps 36 à 40 % (`results/cost.txt`).

## Ce qu'on peut en retenir

- **Ils s'accordent** sur la forme de l'inharmonicité et de l'accord étiré, les
  décroissances du médium en deux temps, l'image stéréo de la musique et le
  soutien de la pédale.
- **coopiano s'écarte** par un aigu doux presque muet, une brillance qui plafonne à
  mezzo-forte, un halo sympathique plus discret, des étouffoirs plus rapides et
  des basses qui tiennent plus longtemps. Les deux premiers écarts ont la même
  origine probable : le temps de contact du marteau, trop long dans l'aigu doux et
  qui ne raccourcit plus dans le fort. C'est l'endroit où chercher en premier (lois
  de raideur et d'exposant du feutre ; `[hammer] stiffness_scale` et
  `velocity_exponent` dans `default.ini`).
- Lequel est le plus juste ne peut se dire qu'avec des enregistrements d'un vrai
  piano ; les scripts acceptent n'importe quel rendu WAV à la place de Pianoteq.

## En passant : l'écriture WAV 16 bits de coopiano

Le rendu hors ligne de coopiano écrit des entiers 16 bits par troncature, sans
dither. Une queue qui descend dans les derniers bits devient une onde presque
carrée, avec des harmoniques impaires exactes de son fondamental. Sur le A6 seul
normalisé à −1 dBFS, la 3ᵉ harmonique est à −34 dB du fondamental en 16 bits,
contre −65 dB en flottant. Sur le C6 d'un fichier de 96 notes, ces harmoniques
cachaient les vrais partiels au point que l'inharmonicité mesurée tombait à zéro.
Arrondir avec un dither triangulaire, ou écrire en flottant, supprimerait cet
effet ; c'est une remarque pour coopiano lui-même, pas pour le portage.

## Écoute

`scripts/pianoteq_analyze.py` écrit dans `build/pianoteq/listen/` le prélude et
la démo de chaque instrument, à sec (`*_dry_*`) et avec sa propre salle
(`*_room_*` : réverbération de coopiano, preset de Pianoteq intact), tous au même
niveau RMS (−20 dBFS) pour que la sonie ne décide pas. Ces fichiers ne sont pas
versionnés : ce sont des rendus d'une version d'essai de Pianoteq, et ils pèsent
120 Mo.

## Reproduire

```bash
scripts/pianoteq_preset.sh         # une fois : écrit le preset sec de Pianoteq
make pianoteq                      # rendus (~4 min), puis mesures et figures
```

`COOPIANO` désigne le dépôt coopiano (par défaut `../../coopiano`), `PIANOTEQ`
l'exécutable de Pianoteq et `PIANOTEQ_FXP` le preset.
