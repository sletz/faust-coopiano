# faust-coopiano

[English version](README.md) · **Le jouer dans le navigateur : https://sletz.github.io/faust-coopiano/**

Un modèle Faust de [coopiano](https://github.com/peterc/coopiano), le piano à modélisation physique
de `piano.hpp` / `instrument.hpp` (C++17, MIT) : marteau, cordes à l'unisson à
deux polarisations, partiels fantômes longitudinaux, bruits de mécanique,
étouffoirs et pédale forte, résonance sympathique, table d'harmonie modale avec
imagerie par régions du chevalet, et la réverbération de `reverb.hpp`. Écrit
pour [faust-rs](https://github.com/grame-cncm/faust-rs) et vérifié avec son `faustprobe` contre le modèle
C++ lui-même.

## Organisation

| Chemin | Contenu |
|---|---|
| `dsp/coopiano.lib` | le modèle (préfixe `cp`), documenté au format des faustlibraries : chaque fonction publique a son `#### Usage` et son `#### Test` (`make doctests`) |
| `dsp/coopiano_tables.lib` | généré : tables tirées ou résolues par le modèle C++ |
| `dsp/coopiano.dsp` | l'instrument polyphonique (`freq`/`gain`/`gate`, `effect = cp.body`) |
| `dsp/coopiano_light.dsp` | le même, table d'harmonie sans imagerie |
| `dsp/coopiano_note.dsp`, `coopiano_hammer.dsp`, `coopiano_voice_out.dsp`, `coopiano_body*.dsp` | les morceaux que comparent les tests |
| `ref/dump.cpp` | inclut les en-têtes de coopiano sans les modifier et écrit les données de référence |
| `scripts/` | génération des tables (ajustement de la table d'harmonie) et comparaisons |
| `tools/render.cpp` | rendu natif hors ligne d'une partition (`scores/demo.txt`) |
| `web/` | la version web : page, clavier, entrée MIDI, hôte AudioWorklet du wasm de faust-rs (`make web`, `make web-serve`) |
| `pianoteq/` | coopiano (C++ et Faust) face à Pianoteq 9 sur les mêmes partitions : rapport (anglais et français), mesures et figures (`make pianoteq`) |

## Utilisation

```bash
make ref        # compile ref/dump.cpp contre ../../coopiano, extrait build/ref (~20 s)
make tables     # dsp/coopiano_tables.lib (ajustement de la table, ~1 min)
make check      # chaque programme compile sous faustprobe
make test       # comparaisons contact, notes et moteur (code 1 au-delà des tolérances)
make keyboard   # la voix contre le C++ sur chaque touche, de la 0 à do 8 (~5 min)
make render     # rendu natif de scores/demo.txt dans build/demo.wav (LIGHT=1 : corps léger)
make results    # toutes les comparaisons et la mesure de coût dans results/*.txt (~30 min)
make paper      # les figures et l'article, paper/faust-coopiano.pdf
make web        # la version web dans web/dsp ; make web-serve, puis http://localhost:8000/web/
```

`COOPIANO` et `FAUST_RS` désignent les deux dépôts (par défaut `../../coopiano`
et `../faust-rs`, avec `faust-rs` et `faustprobe` compilés en release). Avec le
faust-rs `main-dev` du 16 octobre 2026, la voix compile en 8 s environ et le corps
en 5 s (25 s et 45 s la veille ; voir *faust-rs*). `coopiano.lib` 0.2.3 demande
le faust-rs `main-dev` à partir de `ccca27eb` (17 octobre 2026) : un plus ancien
refuse `dsp/coopiano_hammer.dsp` (point 16 du rapport). `JOBS` (4 par défaut) fixe
le nombre de rendus que `make contact`, `notes` et `keyboard` lancent en parallèle.

## Version web

`web/` est l'instrument dans le navigateur : un clavier dans la page, une entrée
Web MIDI, et chaque réglage avec son explication, un onglet par type de réglage,
en français et en anglais.

```bash
make web        # web/dsp : la voix et les deux corps compilés en wasm par faust-rs (~20 s)
make -B web     # idem après un changement de faust-rs (les modules ne dépendent que de dsp/)
make web-serve  # sert le dépôt ; ouvrir http://localhost:8000/web/
make web-check  # le wasm contre faustprobe, et ce qu'il coûte (node)
```

La version publiée est à https://sletz.github.io/faust-coopiano/. C'est `web/`
sur `main`, modules wasm compris : un push sur `main` qui modifie `web/` la publie
(`.github/workflows/pages.yml`, qui ne compile rien). Pour publier de nouveaux
modules : `make -B web` et `make web-check`, puis commiter `web/dsp` en nommant
dans le message le commit faust-rs qui l'a construit, et pousser.

- **Moteur.** La voix et les deux corps sont `dsp/coopiano.dsp` et
  `dsp/coopiano_light.dsp`, compilés par `faust-rs -lang wasm -double` (la voix est
  `process`, un corps est `effect`, avec `-pn effect`). Ils tournent dans un
  AudioWorklet (`web/coopiano-processor.js`) à 44,1 kHz, que le navigateur
  rééchantillonne vers la carte son. Le worklet fait ce que font les architectures
  polyphoniques de Faust :
  - il additionne les cinq sorties des voix vers le corps, calculé une seule fois ;
  - il envoie chaque réglage à toutes les voix et au corps ;
  - une touche refrappée refrappe sa propre voix, sur les cordes qui vibrent encore ;
  - il cesse de calculer une voix relâchée après une demi-seconde sous 1e-6 N ;
  - sans voix libre, il prend la voix relâchée la plus faible, avec un fondu d'un
    bloc ;
  - sans voix qui sonne, il cesse de calculer le corps quand sa sortie est restée
    une seconde sous -120 dBFS : une page au repos ne coûte rien.

  `make web-check` trouve la sortie du wasm égale à celle de faustprobe : -296 dB
  de la crête pour la voix, -270 dB pour les corps.
- **Jouer.**
  - Souris ou écran tactile sur les touches. La vélocité vient de la position du
    clic (plus bas sur la touche, plus fort) ou d'un curseur.
  - Le clavier d'ordinateur, par position des touches quelle que soit la
    disposition : deux rangées à partir de l'octave affichée, ← et → pour la
    décaler, la barre d'espace pour la pédale.
  - Le MIDI : toutes les entrées ou une seule, tous les canaux ou un seul. Note on
    et off avec vélocité, CC64 pour la pédale (demi-pédale comprise), CC120 et
    CC123 pour tout arrêter.

  Une autre application peut le jouer par un port MIDI virtuel : le gestionnaire
  IAC sous macOS, loopMIDI sous Windows. Web MIDI demande Chrome, Edge, Firefox ou
  Opera, et une page servie depuis localhost ou en HTTPS, ce que fait
  `make web-serve`.
- **Réglages.** Les 32 réglages de la voix et du corps, dans les onglets de
  `default.ini` (marteau, cordes, timbre, résonance sympathique, salle, mécanique
  et sortie). Chacun affiche sa plage, sa valeur par défaut et une explication ; un
  double-clic le remet à sa valeur par défaut. La pédale suit aussi la barre
  d'espace et le CC64.
- **Préréglages.** Un premier onglet propose huit types de piano, chacun
  expliqué : grand piano de concert (les valeurs par défaut), grand piano moderne
  brillant, grand piano feutré jazz, piano droit, honky-tonk, piano à feutre,
  grand piano en salle de concert, vieux piano fatigué. Un préréglage part des
  valeurs par défaut et en règle une partie (jamais la pédale) ; les autres
  onglets montrent alors ce qu'il a réglé, et un réglage changé ensuite le
  marque comme modifié. Les modes de la table d'harmonie restent ceux ajustés au
  grand piano C++.
- **Coût.** Compilé par faust-rs `main-dev` à `f69129c1`, le wasm tourne 1,3 à 2
  fois plus lentement que la version native (`make web-check`, node sur un Apple
  M5, seconde en régime établi) :
  | DSP | pédale levée | pédale enfoncée | natif, pédale levée | Emscripten, pédale levée |
  |---|---|---|---|---|
  | voix (une note tenue) | 5,2 à 5,7 % | | 3,1 % | 5,7 % |
  | corps léger | 18 à 19 % | 39 à 41 % | 10 % | 20 % |
  | corps imagé | 45 à 47 % | 67 à 68 % | 36 % | 49 % |
  faust-rs `354e2080` donnait 7,8 %, 41 % et 95 %. Placer les adresses constantes
  de la structure dans le décalage memarg des chargements et des écritures
  (`51642a20`) a mis la voix et le corps imagé au niveau du même C++ compilé par
  Emscripten (`em++ -O3`) ; rapprocher chaque lecture de son usage et reprendre
  une valeur écrite au lieu de la relire (`f69129c1`) y a mis le corps léger
  (rapport, point 14). La page démarre avec le corps léger et 8 voix, et affiche
  la charge du thread audio.

## Ce que le modèle calcule au fil de l'eau

`piano.hpp` prépare chaque frappe hors ligne (contact suréchantillonné 32 fois,
puis un banc de phaseurs amortis). La voix Faust en est l'équivalent en flux :

- **Cordes.** Chaque mode est un résonateur complexe du premier ordre dont la
  partie réelle est le déplacement (la convention de `polarization_state`),
  excité par la force du marteau avec un bloqueur d'ordre 1. Les polarisations
  verticale (rapide) et horizontale (lente) sont deux résonateurs qui se
  partagent la force dans les proportions du C++ : partager l'excitation revient
  à partager l'état à la séparation. Une voix a `NS = 96` emplacements de modes
  partagés par ses cordes (96 partiels pour une basse à une corde, 32 par corde
  pour un triple chœur). Fréquences (avec le décalage réactif dû à l'admittance
  du chevalet), pertes, double décroissance et courbes de timbre de
  `build_string`/`collect_phasors` sont calculées à partir de la note et des
  réglages de `default.ini`.
- **Marteau.** Résolu implicitement à la fréquence audio : la loi du feutre
  `F = K d^p (1 + 0.12 d')`, compression *et* vitesse de compression prises à
  l'échantillon courant, rencontre la réponse directe des cordes à la force
  courante ; équation scalaire résolue par cinq pas de Newton depuis un point
  de départ qui encadre la racine (`scripts/contact_sim.py` vérifie le schéma
  contre `run_contact` en numpy).
- **Partiels fantômes.** Un fantôme est le produit de deux états de modes : le
  produit de deux phaseurs amortis est le phaseur amorti à la fréquence somme,
  c'est ainsi qu'`add_phantoms` les construit, et leur calcul en flux ne demande
  aucun état supplémentaire. Ils tournent dans un domaine `ondemand` de
  faust-rs, uniquement sous le sol#3.
- **Paramètres.** Tout ce qui dépend de la note et des réglages est calculé dans
  des domaines `ondemand` cadencés par leur changement, la note y entrant comme
  signal audio bloqué : recalculer à chaque bloc les 96 emplacements et les 288
  coefficients de fantômes coûtait plus que les cordes elles-mêmes.
- **Bruits de mécanique** : mêmes filtres et enveloppes que `prep_note_into` ;
  leur niveau (`tone_peak_amp`, connu seulement après le contact) vient d'une
  table de la résolution C++ par touche et vélocité.
- **Corps.** La résonance sympathique, la table d'harmonie ajustée par région
  du chevalet et la salle tournent une seule fois sur la somme des voix ; voir
  la section suivante.

## Le corps (`cp.body`)

`cp.body` est l'`effect` de `dsp/coopiano.dsp`. L'architecture polyphonique
additionne les sorties des voix canal par canal et applique le corps une seule
fois à cette somme, comme `instrument.hpp` additionne ses voix avant
`render_force`, `convolve_span` et `finish_block`. Additionner d'abord est exact,
car tout ce qui précède le limiteur est linéaire.

```
voix 1..16 ──(somme par l'architecture polyphonique)──► x0 x1 x2 x3 c
                                                          │
   w = (gain · res_bank(x0 + x1 + x2 + x3) + c) / 4       résonance sympathique
                                                          │
   x0 + w, x1 + w, x2 + w, x3 + w ──► soundboard ──► G, D table d'harmonie, 732 modes
                                                          │
   sur chaque canal : dc_block ─► room ─► × output_gain ─► limit
```

### Ce qui entre : cinq canaux par voix

Une voix calcule `F`, la force de ses cordes sur le chevalet (en newtons), et
sort cinq canaux (`_regions_out`) :

- **`x0` à `x3`, la force répartie sur quatre régions du chevalet.** La touche
  `m` est à la position `(m - 21) / 87` le long du chevalet, et `region_gain`
  fait un fondu linéaire entre les deux régions qui l'entourent (centres à
  0,125, 0,375, 0,625 et 0,875). Le la 0 va entièrement dans la région 0, le
  do 8 dans la région 3, le milieu du clavier moitié dans la région 1, moitié
  dans la région 2. Les quatre gains somment à 1, donc `x0 + x1 + x2 + x3` est
  la force totale des voix. Les régions portent l'image stéréo : la table ne
  répond pas de la même façon selon l'endroit où la force entre sur le
  chevalet. La règle est celle de `key_region_` dans `instrument.hpp`.
- **`c`, la correction de la touche jouée :**
  `c = (own_drive - 1) · gain · res_own(m)(F)`, où `res_own(m)` est une copie
  des résonateurs sympathiques de la touche `m` (16 partiels), excitée par la
  force de la voix, avec l'ouverture qu'a sa touche dans le banc. Avec
  `own_drive = 0` (par défaut), elle retire la part de la voix des résonateurs
  de sa propre touche, comme le fait le banc C++ avec ses lignes `own_force_`
  par touche. Le banc est linéaire, donc `gain · res_bank(somme des F) + somme
  des c` est exactement « chaque voix excite les cordes de toutes les touches
  sauf la sienne ». Seule la voix connaît `m` : c'est pourquoi elle sort cinq
  canaux et non quatre.

### 1. Résonance sympathique (`res_bank`)

`SympatheticResonance` transcrit : 88 touches, 1002 résonateurs, jusqu'à 16
partiels par touche (moins dans l'aigu), excités par la force totale et
seulement sous 7 kHz.

- **Un partiel.** Le partiel `p` de la touche `m` :
  - a pour fréquence `p f0 sqrt(1 + B p²)` ;
  - est un résonateur complexe à un pôle, une rotation amortie ;
  - a un rayon interpolé selon l'ouverture des étouffoirs `o`, entre ouvert (le
    T60 de la touche, plafonné par `maximum_decay_seconds`) et fermé (T60
    `damper_decay_seconds`) ;
  - a une excitation, `2 (1 - r) / (p (1 + (f / 3500)²))`, multipliée par `o`,
    où `r` est le rayon ouvert. Un étouffoir posé laisse donc la corde
    s'éteindre, mais ne lui donne plus d'énergie.
- **Ouverture.** Elle suit `1 - damper_contact(pedal)` à la vitesse
  `1 / transition_seconds`. Les étouffoirs sont posés quand la pédale est sous
  0,25 et entièrement levés au-dessus de 0,65. Les touches 90 à 108 (fa# 6 à
  do 8, `f0` ≥ 1400 Hz) n'ont pas d'étouffoir et sont toujours ouvertes :
  pédale levée, ce sont les seules qui résonnent. Une touche tenue sans être
  jouée ne s'ouvre pas (voir *Différences connues*).
- **Domaines d'horloge.** Les 69 touches à étouffoir (la 0 à fa 6) tournent
  chacune dans un domaine `ondemand`. Un domaine est éveillé tant que les
  étouffoirs sont levés, et pendant six T60 fermés (1,1 s environ) après leur
  pose. Endormi, rien n'est calculé et la sortie vaut 0 : c'est l'essentiel de
  l'écart de coût entre pédale levée et pédale enfoncée. Les paramètres d'une
  touche ne sont recalculés que sur changement (`on_change`) : au premier
  échantillon, quand un réglage de décroissance ou l'harmonisation change, et
  au réveil du domaine.
- **Sortie.** Les 88 sorties sont additionnées par `gsum(88, 8)` : des paquets
  de 8 derrière une barrière opaque, une mesure pour le temps de compilation
  sans effet sur le résultat. La somme est multipliée par `gain` (0,18) et
  ajoutée aux corrections `c`, ce qui donne `w`. `w` est réparti à parts
  égales sur les quatre régions, comme `render_force` répartit tout ce que les
  régions ne comptent pas : le signal sympathique n'a pas de place sur le
  chevalet.

### 2. Table d'harmonie (`soundboard`)

Le C++ convolue, par FFT partitionnées (`convolve_span`), la force de chaque
région avec la réponse de cette région sur les 0,2 premières secondes (la tête
imagée), et la force totale avec une queue partagée. Le modèle remplace cette
convolution par un banc modal :

- **Pôles.** Ce sont les 732 pôles de la table C++, de 48 Hz à 16,5 kHz :
  `λ = exp(-σT) exp(i 2π f T)`.
- **Amplitudes.** Chaque mode a huit amplitudes complexes `A[c][r]`, une par
  canal (G, D) et par région. Elles sont ajustées par moindres carrés à la
  réponse d'`Engine` à une impulsion dans chaque région, tête et queue
  partagée (`scripts/gen_tables.py`, -22,8 à -25,7 dB).
- **Résonateurs.** Chaque mode et chaque canal est un résonateur complexe à un
  pôle, excité par la combinaison complexe des forces de région :
  `s[n] = λ s[n-1] + somme sur r de A[c][r] x_r[n]`, sortie `Im(s)`. Cela fait
  1464 résonateurs.
- **Image stéréo.** Elle vient de ce que les amplitudes gauche et droite
  changent d'une région à l'autre. L'imagerie est figée aux valeurs C++ par
  défaut (spread 0,7, position depth 0,5).
- **Paramètres.** Ils sont lus dans les tables une seule fois, au premier
  échantillon (`_board_chunks(_first, ...)`, 12 domaines `ondemand` de 61
  modes). Le `route` place les 18 paramètres de chaque mode à côté des quatre
  forces.
- **Sommes.** Les deux canaux sont additionnés par `gsum2(732, 32)`.

`body_light` (`dsp/coopiano_light.dsp`) ne change que cette étape.
`soundboard_mono` additionne d'abord les régions et donne à chaque mode un seul
résonateur `u`, lu avec deux amplitudes complexes : `G = Im(a_G u)` et
`D = Im(a_D u)`. Il perd l'imagerie par région et coûte environ trois fois
moins.

### 3. Sortie, sur chaque canal

1. **`dc_block`** : un passe-haut à un pôle à 20 Hz (`DcBlocker`).
2. **`room`** : `StereoReverb` de `reverb.hpp`, ligne à ligne.
   - Le signal d'effet est filtré en passe-haut à 150 Hz, puis retardé
     (`predelay_ms`).
   - Six premières réflexions, de 7 à 31 ms, se croisent entre les canaux.
   - Chaque côté a deux passe-tout de diffusion.
   - Huit lignes à retard (1493 à 2423 échantillons à 44,1 kHz) partagent un
     retour de Walsh-Hadamard non normalisé. Chacune est amortie par un
     passe-bas à un pôle à `damping_hz`, et son gain est réglé pour
     `decay_seconds`.
   - La sortie vaut `sec + mix · (0,45 · premières + 0,70 · tardives /
     sqrt(8))` : le signal sec passe intact.
3. **`× output_gain`** (0,0011) : des newtons au niveau audio.
4. **`limit`** (`limit_output`) : sans effet jusqu'à 0,8, puis un coude en tanh
   vers 1. C'est la seule étape non linéaire, après toutes les sommes.

### Les réglages du corps

| Groupe | Réglage | Défaut | Effet |
|---|---|---|---|
| resonance | `gain` | 0,18 | niveau de la résonance sympathique |
| | `own_drive` | 0 | 1 : la touche jouée excite aussi ses propres résonateurs |
| | `maximum_decay_seconds` | 12 | plafond du T60 ouvert |
| | `damper_decay_seconds` | 0,18 | T60 étouffoirs posés (×6 : durée d'éveil d'un domaine) |
| | `transition_seconds` | 0,04 | vitesse de levée et de pose des étouffoirs |
| reverb | `mix`, `decay_seconds`, `predelay_ms`, `damping_hz` | 0,3, 1,1, 12, 5500 | la salle |
| action | `pedal` | 0 | pédale forte |
| | `output_gain` | 0,0011 | niveau de sortie |

## Résultats (build/ref contre ce modèle, faust-rs, Apple M5)

| Vérification | Résultat |
|---|---|
| Contact du marteau, 8 touches x 4 vélocités (`make contact`) | force crête à 1 % et durée de contact à 1-4 % (un échantillon), sauf do 8 à vélocité 1 : -14 % de crête, contact de 11 échantillons |
| Force au chevalet, 12 notes de la 0 à do 8 (`make notes`) | niveau à 0,1 dB à partir de 50 ms, 0,3 dB sur les 50 premières ms ; spectres en tiers d'octave à 0,6 dB rms |
| Force au chevalet, les 88 touches à vélocité 0,5 (`make keyboard`, `results/keyboard.txt`) | niveau à 0,4 dB sur les 50 premières ms et à 0,1 dB de 50 ms à 1 s ; à 0,7 dB de 1 à 2 s (les queues de l'octave aiguë, 50 à 65 dB plus bas) ; spectres du début à 0,9 dB rms ; spectres tardifs à 1 dB rms sauf ré 7 à mi 7 (jusqu'à 5,7 dB, un partiel faible d'une queue 58 dB plus bas) |
| Relâchement | la décroissance suit le C++ à 0,4 dB jusqu'à -82 dB |
| Résonance sympathique sur la force C++ | identique à 1e-12 (-248 dB) |
| Ajustement de la table d'harmonie | -25,5 dB (réponse partagée), -22,8 à -25,7 dB (régions) ; réponse en fréquence à 0,1 dB en médiane, moins de 0,7 dB pour 90 % des fréquences |
| Instrument complet contre `Engine`, do 4, sec et avec réverbération (`make engine`) | niveau à 0,1 dB par canal pendant la note, corrélation G/D identique (0,355 et 0,311), queue de réverbération à 0,1 dB |
| Coût natif (clang -O3, `results/cost.txt`) | 3,1 % d'un cœur par voix qui sonne ; corps 36 % (pédale levée) à 40 % (pédale enfoncée) ; corps léger 10 % à 15 % |

## Face à Pianoteq

[`pianoteq/README.fr.md`](pianoteq/README.fr.md) mesure le coopiano C++ face à Pianoteq 9 (version
d'essai, « NY Steinway D Classical » sans réverbération) sur les mêmes fichiers MIDI : les
deux s'accordent sur la forme de l'inharmonicité et de l'accord étiré, les décroissances du
médium et l'image stéréo ; l'aigu de coopiano à vélocité 20 est 25 à 38 dB plus faible (relativement au do 4 de chacun), sa brillance
cesse de croître au-dessus de la vélocité 64 (le contact du marteau ne raccourcit plus), son
halo sympathique pédale enfoncée est 17 à 25 dB plus faible et ses étouffoirs plus rapides.
Pianoteq rend 2 à 5 fois plus vite. Le portage Faust, mesuré de la même façon, suit le C++
(écarts médians de 0,5 dB sur les niveaux, 0,3 % sur la brillance, moins de 3 % sur les
décroissances), sauf la fin d'un étouffement pédale levée (la résonance de l'égaliseur de la
table C++, voir les différences connues).

## Différences connues

- **Partiels par corde** : 32 pour un triple chœur ; un do 3 perd le contenu C++
  au-delà de 4,5 kHz (au plus -44 dB de l'énergie, à l'attaque) ; `NS = 144`
  donne 48 partiels par corde pour 1,5 fois le coût d'une voix.
- **Marteau à 44,1 kHz** au lieu de 32 fois plus : exact à 1 % sauf pour les
  contacts les plus courts de l'aigu (do 8 fortissimo).
- **Fantômes** : distance entre partenaires jusqu'à 2 (`piano.hpp` : 3, le terme
  suivant est 15 dB plus bas) ; le seuil à -80 dB n'est pas appliqué. La borne
  par paire (`bound_phantom`) l'est, une fois par frappe, à partir des
  amplitudes des parents à la fin du contact, là où le C++ les prend à la
  passation ; sans elle, A0 et C1 fortissimo étaient 2 à 3 dB plus forts au
  chevalet et jusqu'à 6 dB plus forts à travers le corps.
- **Tirages aléatoires** : l'écart de lecture des cordes à l'unisson est tiré à
  chaque frappe (les tests imposent les tirages de la graine C++) ; les bruits
  de mécanique sont d'autres réalisations du même bruit filtré ; le léger
  désaccord de la seconde polarisation vient d'un hachage.
- **Niveau des bruits** : issu du contact pour le réglage par défaut ; d'autres
  réglages du marteau modifient exactement les cordes mais seulement
  approximativement les bruits de mécanique.
- **Résonance sympathique** : ouverte par la pédale et par l'aigu sans
  étouffoirs ; les cordes d'une touche tenue sans être jouée, que le C++ ouvre,
  ne s'ouvrent pas (une voix ne voit pas les autres, et le corps ne voit que
  leur somme).
- **Table d'harmonie** : imagerie figée aux valeurs C++ par défaut (spread 0,7,
  position_depth 0,5) et réglages de la table figés à `default.ini`
  (`make tables` après les avoir changés dans `ref/dump.cpp`). Après un
  relâchement, la table C++ continue de sonner, surtout entre 300 Hz et 1 kHz :
  son égaliseur (`flatten_ir`), calculé sur une grille FFT de 0,34 Hz, relève de
  jusqu'à 20 dB les trois quarts des creux étroits de la table au-dessus de
  450 Hz, et ces pics étroits résonnent environ 2 s, jusqu'à la coupure de la
  réponse à 1,4 s. L'ajustement modal, sur les modes C++ (T60 d'au plus 0,45 s),
  ne peut pas porter cette résonance, et 64 résonateurs ajustés dessus n'y
  gagnent que 1 à 2 dB : la réponse de la table est à -48, -56, -72 dB (C++)
  contre -65, -92, -158 dB (Faust) sur 0,3-0,5, 0,5-0,75 et 1-1,4 s, relativement
  à ses 50 premières ms. Après un do 4 piqué, pédale levée, l'instrument est
  15 à 25 dB sous le C++ dès 0,35 s après le relâchement ; la réverbération de la
  salle le masque environ une seconde après le relâchement.
- **Rôle de l'hôte** (vol de voix, arrêt sur niveau, `fade_tail`) : c'est celui
  de l'architecture polyphonique ; `tools/render.cpp` arrête une voix relâchée
  après une demi-seconde sous 1e-6 N.

## faust-rs

Ce modèle a rencontré plusieurs limites de faust-rs, contournées ici et
décrites dans [`faust-rs-issues/RAPPORT.md`](faust-rs-issues/RAPPORT.md) (pour
chacune, un reproducteur minimal, la cause dans le code de faust-rs et une
correction possible). La plupart sont corrigées dans le faust-rs `main-dev` du
16 octobre 2026 ; la première section du rapport donne les commits et les mesures.
Corrigé :

- l'évaluateur mémoïse les applications de fonction (`gApplyMemo` du C++) : un
  appel dans le corps d'un lambda n'est plus réévalué à chaque application, et la
  compilation de la voix est passée de 41 s et 17 Go à 7 s et 2,8 Go. La voix garde
  son style « flot de boîtes », écrit pour l'éviter ;
- les longues sommes, la fusion des récursions isomorphes, le point fixe des types
  récursifs et celui des horloges ne coûtent plus le nombre de groupes de récursion
  fois le graphe : le corps compile en 5 s au lieu de 45 s, et la voix suivie du
  corps en un seul programme en 13 s au lieu de 363 s. `gsum` fait encore gagner
  0,5 s sur le corps et reste ;
- `x*x` (normalisé en `pow(x, 2)`) est un produit sur tous les backends, plus un
  appel de bibliothèque ; la formule des fantômes sans carré reste ;
- `faustprobe --nvoices` fait tourner l'instrument avec son corps en `effect`
  (`make check`) ;
- les diagnostics nomment les mots réservés (`rad` et `fad`, qui restent réservés),
  expliquent `-max(...)` et `-L.g(...)`, et situent une erreur d'arité sur la
  composition fautive.

Toujours ouvert : `-vec` sur la voix ne termine pas (planification vectorielle en
O(L⁴) sur 31 825 boucles), et le travail au taux de bloc sort d'un domaine
`ondemand` si son entrée n'est pas tenue au taux audio, d'où `on_change`. Trouvé
avec la version web : le code du backend wasm était 1,3 à 1,8 fois plus lent que
celui d'Emscripten sur le même C++, un écart que `main-dev` a comblé
(`51642a20`, et `f69129c1` pour le corps léger ; point 14), et une somme d'une constante,
d'une commande et d'un signal est groupée autrement qu'en C++ (point 15) : la
partie lente n'est plus hissée et l'arrondi diffère. Ce second point gardait
éveillées les touches étouffées de la résonance sympathique après la première
pédale ; `coopiano.lib` 0.2.1 le contourne par un seuil.
