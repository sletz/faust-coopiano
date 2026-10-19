# Pourquoi le wasm de coopiano est plus lent que le natif

Étude du 17 octobre 2026 : on mesure, cause par cause, l'écart de coût entre les
modules wasm de la version web et le C++ natif. Le compilateur n'a pas été
modifié pour cette étude. Firefox a été ajouté le 19 octobre 2026 (section 6).
Version anglaise : [README.md](README.md).

| Élément | Version |
|---|---|
| faust-rs | `main-dev` à `c6d9aece` |
| `coopiano.lib` | 0.2.4 (`e14d953`) |
| C++ | Apple clang 21.0.0 |
| node | 22.12.0 (V8 12.4) |
| Chrome | 155.0.8059.85, et Canary 158.0.8110.0 |
| Firefox | 158.0, et Nightly 160.0a1 |
| Machine | Apple M5, macOS 26.7.1 |

## Résumé

1. **L'écart dans Chrome.** On compare au C++ natif de même sémantique (IEEE
   strict, sans FMA, sans vectorisation). Le wasm coûte 2,4 fois plus pour la
   voix, 1,5 fois plus pour le corps imagé, 1,45 à 1,6 fois plus pour le corps
   léger.
2. **Ce ne sont pas les libertés du compilateur C++.** `-ffast-math`, les FMA
   et la vectorisation automatique n'expliquent pas l'écart. Le natif privé de
   tout cela n'est pas plus lent. Le corps imagé est même plus rapide sans
   vectorisation : 26,6 % d'un cœur au lieu de 36,8 %.
3. **Le wasm exécute environ deux fois plus d'instructions** par échantillon :
   2,4 fois pour la voix, 1,8 fois pour le corps, 2,1 fois pour le corps léger.
   Le rythme par cycle est comparable (IPC de 3 à 5,5). Le surplus vient du
   code que V8 génère pour une fonction `compute` géante.
   - **Déversements de registres.** Le code V8 fait 2,8 fois plus d'accès à la
     pile que clang, dans un cadre de 37 Ko. Au-delà de 256 octets du pointeur
     de cadre, chaque accès coûte une instruction de plus pour construire son
     adresse.
   - **Constantes flottantes.** V8 construit chacune en cinq instructions.
   - **Rechargements de l'état.** V8 relit l'état DSP environ deux fois plus
     souvent que clang.
4. **Les fonctions mathématiques importées du JavaScript** pèsent sur la voix,
   et presque pas sur les corps.
   - `Math.pow` appelé depuis le wasm coûte 64 ns, contre 3,8 ns pour la libm.
   - La voix en fait 7 par échantillon, dans le contact du marteau.
   - Remplacer `Math.pow` par `exp(y·log x)` fait passer la voix de 6,76 % à
     6,02 % sous node.
5. **`fastmath.lib` ne paie pas ici.** Avec `fa.fpow`, `fa.fexp` et `fa.fsin`
   aux endroits calculés à chaque échantillon, la voix devient plus lente
   partout : 10 à 12 % au lieu de 7 à 7,7 % dans Chrome, 4,5 % au lieu de 2,9 %
   en natif. C'est du code ajouté à une fonction déjà géante.
6. **Les versions de V8.** Chrome 155 et Canary 158 donnent les mêmes coûts sur
   le fil principal. Node 22 est nettement plus lent sur le corps léger : 21 %
   contre 13 %.
7. **Découper la boucle n'a pas pu être mesuré.** `-vec` ne termine pas sur le
   corps léger : 900 s, 18,9 Go résidents, 155 Go d'empreinte mémoire au pic.
8. **Firefox ne passe pas ces modules au niveau optimisé.** Par défaut,
   Firefox 158 et Nightly 160 les exécutent avec leur code de base, même après
   30 s : le corps imagé coûte 74 % d'un cœur pédale levée et 125 à 134 %
   pédale enfoncée, ce qui n'est pas du temps réel. Avec Ion forcé, Firefox est
   plus rapide que Chrome sur la voix (4,1 % contre 7,0 % ; `Math.pow` y coûte
   5 ns, contre 21 ns dans Chrome) et 1,1 à 1,4 fois plus lent sur les corps.

## Méthode

La charge est celle de `scripts/web_check.mjs` :

- blocs de 128 échantillons à 44,1 kHz ;
- la voix tient un do 4 (`freq`, `gate` = 1) ;
- un corps reçoit 1e-3 sur chaque entrée, pédale levée ou enfoncée.

On mesure une seconde après deux secondes de chauffe. Le chiffre retenu est le
meilleur de cinq essais, les variantes étant alternées à chaque tour. Les mêmes
DSP sont compilés par faust-rs, en C++ et en wasm, à partir des mêmes sources :
`dsp/coopiano.dsp` pour la voix, et `-pn effect` de `dsp/coopiano.dsp` et
`dsp/coopiano_light.dsp` pour les corps.

Fichiers de ce répertoire :

| Fichier | Rôle |
|---|---|
| `nbench.cpp` | banc natif (le prélude de `tools/render.cpp`) ; inclut `voice.cpp`, `body.cpp` et `light.cpp` |
| `wbench.mjs` | banc wasm sous node, même charge. `--count` compte les appels mathématiques par échantillon. `--pow-exp-log` remplace `Math.pow` par `exp(y·log x)` |
| `webbench.html` | même mesure dans un navigateur (Chrome, Firefox), sur le fil principal, pour les jeux de modules de `build/hist/<nom>/`. `?warm=N` fixe l'échauffement en secondes (2 par défaut) ; il affiche le pas de l'horloge |
| `calls.wat`, `calls.mjs`, `calls.c` | coût d'un appel mathématique depuis le wasm et en natif |
| `calls.html` | `calls.mjs` dans un navigateur, pour `build/study/calls.wasm` (`wasm-as wasm-vs-native/calls.wat`) |
| `accuracy.mjs` | écart maximal entre deux jeux de modules, sur les rendus de `web_check` |

Reproduire :

```bash
FR=../faust-rs/target/release/faust-rs; mkdir -p build/study
$FR -double --timeout 0 -cn coopiano_voice -I dsp dsp/coopiano.dsp -o build/study/voice.cpp
$FR -double --timeout 0 -cn coopiano_body -I dsp -pn effect dsp/coopiano.dsp -o build/study/body.cpp
$FR -double --timeout 0 -cn coopiano_light -I dsp -pn effect dsp/coopiano_light.dsp -o build/study/light.cpp
c++ -std=c++17 -O3 -march=native -ffp-contract=off -fno-vectorize -fno-slp-vectorize -I build/study wasm-vs-native/nbench.cpp -o build/study/nbench
build/study/nbench light_up 1
node wasm-vs-native/wbench.mjs light_up 1 web/dsp
```

`nbench` et `wbench.mjs` acceptent les modes `voice`, `body_up`, `body_down`,
`light_up` et `light_down`.

Dans Chrome, `webbench.html` lit chaque jeu de modules dans
`build/hist/<nom>/`. Par exemple, pour les modules d'un commit :

```bash
c=e14d953; mkdir -p build/hist/$c
for f in voice body body_light; do for e in wasm json; do git show $c:web/dsp/$f.$e > build/hist/$c/$f.$e; done; done
```

Il demande aussi un serveur (`python3 scripts/web_serve.py 8765`), puis
`http://localhost:8765/wasm-vs-native/webbench.html?sets=e14d953&rounds=4`.
En headless, il faut `--enable-features=WebAssemblyUnlimitedSyncCompilation` :
le fil principal refuse sinon d'instancier synchroniquement un module de plus
de 8 Mo.

Dans Firefox, `webbench.html` et `calls.html` tournent en headless avec un
profil neuf (`firefox --headless --no-remote --profile DIR URL`), dont le
`user.js` contient :

```js
user_pref("privacy.reduceTimerPrecision", false);
user_pref("privacy.reduceTimerPrecision.unconditional", false);
user_pref("devtools.console.stdout.content", true);   // lignes BENCH sur stdout
user_pref("dom.max_script_run_time", 0);
user_pref("javascript.options.wasm_baselinejit", false); // les lignes « Ion seul »
```

## 1. Le natif sans ses libertés

Coût en % d'un cœur, meilleur de cinq :

| Compilation | voix | corps levée | corps enfoncée | léger levée | léger enfoncée |
|---|---|---|---|---|---|
| `-O3 -ffast-math -march=native` (celle de coopiano) | 2,85 | 36,79 | 47,03 | 9,28 | 17,11 |
| même, `-ffp-contract=off` (sans FMA) | 2,96 | 31,04 | 43,23 | 8,96 | 21,05 |
| `-O3 -march=native` (IEEE strict, FMA permis) | 2,78 | 35,37 | 45,40 | 7,64 | 14,11 |
| même, `-ffp-contract=off` | 2,97 | 31,33 | 42,66 | 8,91 | 18,80 |
| `-ffast-math`, sans vectorisation | 2,80 | 25,60 | 35,56 | 8,06 | 14,91 |
| **strict, sans FMA, sans vectorisation** (le plus proche du wasm) | 2,98 | 26,60 | 37,76 | 8,92 | 18,66 |
| wasm, node 22 | 7,04 | 45,17 | 66,15 | 21,91 | 39,52 |
| wasm, Chrome 155, fil principal | 7,0–7,2 | 39,9–41,1 | 55,9–58,0 | 12,8–13,1 | 30,0–30,9 |
| wasm, Canary 158, fil principal | 7,1–7,7 | 40,1–40,6 | 56,1–57,1 | 13,0–13,3 | 30,1–30,3 |

- **`-ffast-math` ne gagne rien.** La compilation stricte est aussi rapide, et
  même plus rapide sur le corps léger (7,64 % contre 9,28 %).
- **Les FMA vont dans les deux sens.** Les retirer fait gagner sur les corps
  pédale levée (31,0 % contre 36,8 %) et perdre sur le corps léger pédale
  enfoncée (21,1 % contre 17,1 %).
- **La vectorisation automatique coûte sur le corps imagé** : 36,8 % avec,
  25,6 % sans.

Le wasm n'est donc pas plus lent parce qu'il n'a ni FMA scalaire, ni
réassociation, ni vectorisation automatique.

**Remarque pour coopiano.** Sur cette machine, `-fno-vectorize
-fno-slp-vectorize` rend le rendu natif du corps imagé 30 % moins cher. Les
options `NATIVE` du `Makefile` mériteraient d'être revues.

## 2. Instructions et cycles par échantillon

Les compteurs de `/usr/bin/time -l` sont pris entre une mesure d'une seconde et
une de cinq ; la chauffe et la compilation s'annulent dans la différence.
Meilleur de deux.

| DSP | natif le plus proche du wasm | natif `-ffast-math` | wasm node 22 |
|---|---|---|---|
| voix | 14 164 instr., 2 829 cycles (IPC 5,0) | 13 921 / 2 695 (5,2) | 34 655 / 6 241 (5,6) |
| corps levée | 69 383 / 25 167 (2,8) | 97 625 / 34 859 (2,8) | 124 841 / 41 950 (3,0) |
| léger levée | 31 749 / 8 421 (3,8) | 29 586 / 8 881 (3,3) | 66 152 / 20 267 (3,3) |

Le wasm exécute 1,8 à 2,4 fois plus d'instructions. Il ne les exécute pas plus
lentement. C'est donc la quantité de code qui compte.

## 3. Ce que contient le code de V8

Code machine de `compute` du corps léger, en entier, gardes comprises : V8 avec
`node --print-wasm-code`, clang avec `objdump` sur la compilation stricte sans
FMA ni vectorisation.

| Catégorie | V8 TurboFan | clang |
|---|---|---|
| instructions | 321 878 | 144 454 |
| déplacements et constantes (`movz`, `movk`, `movn`, `fmov`) | 118 915 | 19 059 |
| chargements pile + mémoire | 49 962 + 46 397 | 17 974 + 24 129 |
| rangements pile + mémoire | 25 568 + 17 458 | 9 334 + 16 754 |
| arithmétique flottante | 52 060 | 46 791 |

- **L'arithmétique est la même.** Le surplus est ailleurs.
- **Déversements.** La pile reçoit 75 530 accès chez V8 contre 27 308 chez
  clang, dans un cadre de 37 Ko (`sub sp, sp, #0x9060`).
- **Immédiats d'adresse.** 69 % des `movz`, `movk` et `movn` de V8 construisent
  le décalage d'un chargement ou d'un rangement, typiquement
  `movn x16, #0x35f; ldr d7, [fp, x16]` : une case de déversement à plus de
  256 octets du pointeur de cadre.
- **Constantes flottantes.** 18 % de ces immédiats construisent une constante
  : quatre `movz`/`movk` et un `fmov` par double. clang charge la même constante
  en une seule instruction.
- **État DSP.** V8 recharge la mémoire linéaire environ deux fois plus. Les
  rangements de l'état sont en revanche équivalents (17 458 contre 16 754).

Au fil d'un échantillon, le wasm du corps léger fait 7 967 chargements et 3 157
rangements pour 12 760 opérations flottantes, hors gardes, d'après `wasm-dis`.
La voix en fait 3 133, 912 et 5 180. La boucle par échantillon du corps léger
compte 6 450 instructions C++ : le répartiteur de registres de V8 ne la tient
pas, celui de clang beaucoup mieux.

## 4. Les fonctions mathématiques

Appels par échantillon, comptés à l'exécution (`wbench.mjs --count`) :

| DSP | appels |
|---|---|
| voix | `exp` 7,25 ; `pow` 7,16 ; `sin` 1,13 ; `cos` 0,13 ; `log` 0,05 ; `tanh` 0,01 |
| corps, corps léger | `tanh` 2,00 (le limiteur de sortie ; `select2` calcule ses deux branches) ; `pow` 0,06 ; `exp` 0,01 |

Pour la voix, ces appels viennent du solveur du feutre du marteau
(`felt_solve`, et la force `F`) pour les 7 `pow`. Les bruits d'action (les
enveloppes `exp(-t/τ)` et `sin(π·x)` du knock) fournissent les `exp` et `sin`.

Coût d'un appel, arguments indépendants, net de la boucle (`calls.*`) :

| Fonction | wasm → `Math.*` (node) | libm, `-O3` strict | libm, `-O3 -ffast-math` |
|---|---|---|---|
| `exp` | 2,6 ns | 0,9 ns | 1,3 ns |
| `sin` | 3,6 ns | 1,0 ns | 1,4 ns |
| `tanh` | 10,8 ns | 1,9 ns | 2,4 ns |
| `pow` | **63,9 ns** | 3,8 ns | 0,03 ns (clang réécrit `pow(a, 2.5)` en produits et racine) |

- **Estimation pour la voix.** Les appels coûtent environ 450 ns de plus par
  échantillon, dont 430 pour `pow`, soit 2 % d'un cœur. C'est la moitié de son
  écart de 3,8 points (6,76 % sous node contre 2,98 % en natif).
- **Mesure directe sur la voix.** Avec `Math.pow` remplacé par `exp(y·log x)`
  (deux appels moins chers, même code Faust), la voix passe de 6,76 % à 6,02 %.
  `pow` coûte donc au moins 0,7 point en situation.
- **Les corps.** Les deux `tanh` coûtent 0,08 % d'un cœur : négligeable.

**La variante `fastmath.lib`.** On remplace les seuls appels faits à chaque
échantillon par leurs versions Faust :

- dans le marteau, les 7 `pow` par `fa.fpow`, dont la base est toujours
  positive ;
- dans les bruits, 7 `exp` par `fa.fexp` et 1 `sin` par `fa.fsin` ;
- dans le limiteur, `tanh` par `fa.ftanh`.

La voix ne diffère que de −288 dB du pic, et les corps sont identiques au bit
près. Son coût :

| Voix | 0.2.4 | avec `fa.*` |
|---|---|---|
| wasm, Chrome 155 | 7,0–7,2 | 10,0–10,2 |
| wasm, Canary 158 | 7,1–7,7 | 10,2–11,9 |
| wasm, node 22 | 6,75 | 8,68 |
| natif strict sans FMA ni vectorisation | 2,90 | 4,47 |
| natif `-ffast-math` | 2,75 | 3,48 |

Les corps ne bougent pas : léger 21,1 → 20,5 % et imagé 43,5 → 43,7 % sous node.

`fa.fpow` passe par `flog2`, une échelle de comparaisons, et par `fexp2`, une
table et un polynôme. Recopié sept fois dans une fonction déjà au-delà de ce
que le répartiteur de registres tient, ce code coûte plus que les appels qu'il
remplace. `fastmath.lib` reste utile dans une petite boucle, pas ici.

## 5. Découper la boucle

Si les déversements sont la cause principale, une boucle plus courte devrait
coûter moins cher. C'est ce que fait le mode vectoriel de faust-rs : plusieurs
boucles sur le bloc, chacune avec moins de valeurs vivantes. Mais
`-vec -vs 32` sur le corps léger ne termine pas. Au bout du délai de 900 s, il
occupe 18,9 Go résidents et 155 Go d'empreinte au pic, la machine échangeant
sur le disque. Le point 12 du rapport (`-vec` en O(L⁴)) vaut donc aussi pour
les corps, et l'hypothèse reste à mesurer.

## 6. Firefox

Mesuré le 19 octobre 2026 avec `webbench.html` dans Firefox en headless, sur la
même machine et avec les mêmes jeux de modules : `e14d953`, et `fm` pour la
variante `fastmath.lib`. Chrome 155 a été remesuré le même jour comme point de
repère, et ses chiffres sont ceux du 17 octobre. D'autres travaux tournaient
sur la machine (charge moyenne de 2,3 à 3).

Deux comportements de Firefox comptent ici :

- **L'horloge.** Firefox arrondit `performance.now()` par défaut (à 1 ms, ou à
  20 µs), et `webbench` additionne des durées de blocs de 0,2 à 1,7 ms. Le
  profil désactive l'arrondi (voir Méthode). `webbench` affiche désormais le
  plus petit pas d'horloge qu'il observe : moins de 0,1 µs dans ce Firefox,
  100 µs dans Chrome en headless.
- **Les niveaux de compilation.** SpiderMonkey compile d'abord le wasm avec son
  compilateur de base, puis recompile une fonction avec Ion, son compilateur
  optimisant, une fois cette fonction chaude (« lazy tiering »). D'où deux
  lignes par Firefox : le réglage par défaut, et
  `javascript.options.wasm_baselinejit` = false, qui compile tout avec Ion dès
  le départ.

Coût en % d'un cœur, `e14d953`, plage sur cinq tours :

| Build | voix | corps levée | corps enfoncée | léger levée | léger enfoncée |
|---|---|---|---|---|---|
| natif strict, sans FMA ni vectorisation | 2,98 | 26,60 | 37,76 | 8,92 | 18,66 |
| Chrome 155 | 7,0–7,2 | 39,7–40,5 | 54,4–57,0 | 12,9–13,3 | 29,4–31,0 |
| Firefox 158, par défaut | 6,1–6,5 | 74,1–80,6 | 125,5–133,5 | 29,1–29,5 | 69,8–71,2 |
| Firefox 158, Ion seul | 4,1–4,3 | 43,7–46,0 | 67,9–71,4 | 17,9–19,4 | 38,4–41,0 |
| Nightly 160.0a1, par défaut | 6,1–6,3 | 73,4–76,2 | 128,2–132,1 | 29,1–29,7 | 69,6–72,4 |
| Nightly 160.0a1, Ion seul | 4,0–4,2 | 43,0–44,0 | 67,2–72,9 | 17,7–18,6 | 38,1–38,8 |

- **Par défaut, Firefox n'exécute jamais le code optimisé de ces modules.** Le
  réglage par défaut coûte 1,5 à 1,9 fois ce que coûte Ion. Un échauffement
  plus long n'y change rien : avec `?warm=10`, le corps pédale levée coûte 72,6
  à 75,7 %, et avec `?warm=30`, 73,3 %. `wasm_lazy_tiering_synchronous` = true,
  qui compile une fonction avec Ion dès qu'elle est jugée chaude, n'y change
  rien non plus. Le déclencheur ne se déclenche donc jamais sur ces fonctions.
  - Avec `wasm_lazy_tiering` = false, chaque fonction est compilée avec Ion en
    arrière-plan après la compilation de base. Les corps atteignent alors le
    coût d'Ion dans les 2 s d'échauffement : 43,7–45,4/68,3–71,8 % pour le
    corps imagé, 17,8/38,7–40,6 % pour le léger. Pas la voix (6,3 à 6,7 %).
  - **Pour la version web**, cela veut dire que dans un Firefox par défaut, le
    corps imagé demande 0,75 cœur pédale levée et 1,3 cœur pédale enfoncée : il
    ne peut pas tourner en temps réel. C'est mesuré sur le fil principal.
    L'AudioWorklet n'a pas été mesuré, mais il utilise le même moteur et les
    mêmes niveaux.
- **Ion bat V8 sur la voix** : 4,1 % contre 7,0 %, soit 1,4 fois le natif au
  lieu de 2,4. `Math.pow` en explique une partie (tableau ci-dessous) : 7,2
  appels par échantillon, à 16 ns de moins chacun, font 0,5 point sur 2,9.
- **V8 bat Ion sur les corps.** Ion coûte 1,1 fois V8 sur le corps imagé pédale
  levée et 1,25 fois pédale enfoncée, et 1,3 à 1,4 fois sur le corps léger.
  Rapporté au natif, Ion coûte 1,6 à 2,1 fois sur les corps, et V8 1,45 à
  1,6 fois.
- **`fastmath.lib` ne rapporte toujours rien.** Avec `fm`, la voix coûte 6,8 à
  7,3 % sous Ion (6,7 à 7,0 % dans Nightly), contre 4,0 à 4,3 %. Les corps ne
  bougent pas. Dans Chrome le même jour : 9,9 à 10,8 % contre 7,0 à 7,2 %.
- **Nightly 160 et Firefox 158 donnent les mêmes coûts**, dans les deux modes.

Coût d'un appel mathématique depuis le wasm, en ns (`calls.html`, la version
navigateur de `calls.mjs`) :

| Fonction | Firefox 158 | Nightly 160 | Chrome 155 (headless) | node 22 | libm, `-O3` strict |
|---|---|---|---|---|---|
| `exp` | 2,58 | 2,57 | 2,33 | 2,6 | 0,9 |
| `sin` | 2,98 | 3,01 | 7,43 | 3,6 | 1,0 |
| `tanh` | 5,59 | 5,53 | 6,62 | 10,8 | 1,9 |
| `pow` | 5,36 | 5,10 | 21,18 | 63,9 | 3,8 |

Les 64 ns de la section 4 sont ceux de node 22. Chrome 155 en prend le tiers,
et Firefox s'approche du coût de la libm. L'estimation de la section 4 (430 ns
par échantillon de voix pour `pow`) ne vaut donc que pour node : dans Chrome,
elle est d'environ 125 ns, et dans Firefox d'environ 10 ns.

## Pistes pour faust-rs, par gain attendu

1. **Une boucle par échantillon plus petite pour V8.** C'est le plus gros gain
   possible : l'essentiel du surplus d'instructions vient des déversements et
   de l'adressage de la pile. Trois moyens :
   - un `-vec` qui termine (point 12 d'abord) ;
   - une fission de la boucle propre au wasm ;
   - des sous-fonctions appelées par la boucle.

   Gain non mesuré ; la borne est un facteur proche de 2 sur les instructions
   des corps.
2. **Ne plus appeler `Math.pow` depuis le wasm.** C'est 0,7 à 2 points sur la
   voix, soit 10 à 30 % de son coût. Deux moyens :
   - un `pow` compilé dans le module (une libm wasm, à la précision de la
     libm) ;
   - à défaut, un `pow` JavaScript plus rapide que celui de V8, à condition
     que sa précision reste celle de la libm.
3. **Les constantes flottantes.** V8 en construit chacune en cinq instructions,
   soit 18 % de ses immédiats sur le corps léger. Les charger depuis la mémoire
   coûterait une instruction, plus son adresse. À mesurer.
4. **Ne pas attendre de gain des FMA wasm (relaxed SIMD) ni du SIMD sur ces
   DSP.** En natif, ni les FMA ni la vectorisation ne les accélèrent.
5. **Mesurer dans Chrome, pas seulement sous node.** `make web-check` tourne
   sous node 22, dont le V8 est plus ancien : il surestime le corps léger de
   1,6 fois par rapport à Chrome. Et mesurer dans Firefox : ses coûts
   s'écartent de ceux de Chrome dans les deux sens (section 6).
6. **Faire exécuter le code optimisé par Firefox.** Les utilisateurs de
   Firefox ont par défaut le code de base : 1,5 à 1,9 fois le coût d'Ion, et un
   corps imagé hors du temps réel. La page ne peut pas changer les préférences
   de Firefox. Des fonctions plus petites (piste 1) permettraient peut-être
   aussi au lazy tiering de se déclencher ; c'est une hypothèse, à mesurer. Le
   comportement mérite un rapport à Mozilla.

## Sans rapport avec l'écart wasm/natif

Chrome Canary 158.0.8110.0 sature le fil AudioWorklet (99 à 100 % d'un cœur
pour quelques notes), là où Chrome 155 et Canary lancé avec
`--js-flags=--no-liftoff` restent vers 76 à 79 %. Sur le fil principal, les
deux versions calculent pourtant au même coût. C'est une régression de Canary.
