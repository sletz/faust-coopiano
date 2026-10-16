# Problèmes de faust-rs rencontrés en portant coopiano

Rapport du 16 octobre 2026. Ce sont les défauts, limites et écarts de faust-rs que
le portage de coopiano en Faust (`faust-coopiano`) a rencontrés. Pour chacun :

- le constat mesuré ;
- un reproducteur minimal, dans ce répertoire ;
- la cause dans le code, avec fichier et ligne ;
- la situation du Faust C++ ;
- une correction possible.

**Versions utilisées.**

- faust-rs : binaires release du 15 octobre 2026. La branche courante du dépôt est
  `serializeout-spec` ; les numéros de ligne sont ceux de son HEAD, `bf65d311`.
- Faust C++ amont : `faust` 2.90.8 (`/usr/local/bin/faust`) et le dépôt
  `/Users/letz/faust`.
- Branche C++ de référence du portage : `RUST/faust`, `8eebea429`, branche
  `master-dev-ocpp-od-fir-2-FIR19`.
- Machine : Apple M5.

**Exécuter les reproducteurs.** Tous se lancent depuis ce répertoire :

```bash
cd faust-coopiano/faust-rs-issues
```

`FR` désigne `../../faust-rs/target/release/faust-rs` et `FP` désigne
`../../faust-rs/target/release/faustprobe`.

**Comment les causes ont été établies.** Elles viennent de la lecture du code. Les
points clés ont été vérifiés directement sur les sources :

- la boucle sur les paires de `greatest_divisor` ;
- le `push_scope` à chaque application ;
- le dimensionnement de `poly_probe.rs` ;
- `emit_pow` ;
- les jetons du lexer.

Aucune correction n'a été appliquée à faust-rs au moment de ce rapport ; la
section suivante dit où chaque point en est depuis.

## État au 16 octobre 2026 au soir

faust-rs `main-dev` à `354e2080`, binaires release, même machine. Le corps du
rapport ci-dessous est conservé tel qu'écrit le matin ; ses numéros de ligne sont
ceux de `bf65d311`.

| # | État | Commits faust-rs | Mesure aujourd'hui |
|---|---|---|---|
| 1 | corrigé | `d8543508` (port de `gApplyMemo`), `13040c09`, `3e1ddd5c` | `r01` : linéaire en D ; 0,06 à 0,1 ms d'évaluation pour les quatre formes jusqu'à D = 14, au lieu de 70 ms pour la forme lambda |
| 2 | corrigé pour l'essentiel | les mêmes | voix (`coopiano_hammer.dsp`) : 7,4 s et 2,8 Go au pic, au lieu de 41 s et 17,35 Go ; trois compilations simultanées : 8,4 s chacune, 0,25 s de temps système, au lieu de 216 s et 126 s |
| 3 | A corrigé, B rejeté | `50e32677` | `r02`, une somme de 1 024 termes : 2,94 s → 0,25 s, désormais quadratique (chaque somme partielle ré-aplatit ses k termes, comme en C++) ; groupée par 32 : 0,05 s. Sur le corps, `gsum` fait encore gagner 0,5 s (4,5 s groupé, 5,0 s sans). B, sauter le second `simplify`, changerait le code de 151 programmes du corpus : écarté |
| 4 | corrigé | `06ad235a` (DIFF-BEH-022) | `r09a` : aucun `powf`, 133× le temps réel au lieu de 29× (`r09b` : 129×) ; le produit est écrit en ligne sur tous les backends, valeurs identiques au helper `faustpower` du C++ |
| 5 | corrigé | `1c43f0cc`, `ad118420` | `r10b` passe ; l'instrument complet tourne sous `faustprobe --nvoices` avec son corps en `effect` (5 → 2 canaux), et `make check` le vérifie |
| 6 | ouvert | — | `r13a` : les 15 `exp` sont toujours hissés avant la boucle ; le contournement `on_change` reste nécessaire |
| 7 | diagnostic corrigé ; mots réservés conservés | `354e2080` | l'erreur nomme le mot réservé et propose `rad_` ; rendre ces mots contextuels a été écarté par décision |
| 8 | corrigé | `354e2080` | `-max(…)` et `-sin(…)` expliquent la règle et proposent `0 - …` ; `-L.g(…)` est localisé sur le `-` et expliqué |
| 9 | corrigé | `354e2080` | `r08` et `r08b` pointent le `:` fautif de la ligne 4 (l'évaluateur garde la composition source de chaque composition qu'il construit) |
| 10 | corrigé | `8e0e2933`, `4bb36491`, `8cb6431d` | `voice_out_drawn(…) : body` en un seul programme : 13,3 s au lieu de 363 s ; voix seule 7,4 s et corps seul 4,5 s, au lieu de 25 et 45 s |
| 11 | non reproduit | — | la voix qui l'a provoqué n'existe plus sous cette forme ; à réessayer si une grande fonction `compute` échoue de nouveau |
| 12 | ouvert | — | voix en `-vec -vs 32` : 31 825 boucles et 95 060 arêtes de données ; délai de 180 s dépassé, 7 Go ; la correction proposée (chaînage par ressource) reste valable |
| 13 | corrigé | `d8543508` | MEMOIZATION §2.4c et §3.7 décrivent désormais `gApplyMemo` |
| 14 | ouvert (constaté le 16 au soir) | — | `r15` : le wasm de faust-rs coûte 1,3 à 1,8 fois le C++ de faust-rs compilé par `em++ -O3`, sorties identiques à faustprobe |
| 15 | corrigé (port de l'amont) | `8886a772` | `r16` : `1 - c - o` donne désormais `(1 - c) - o`, `1 - c` est hissé et la récurrence atteint 0. faust-rs suivait la référence épinglée ; c'est l'amont qui a changé (`d4d51e5ed`, 9 août 2026), porté dans faust-rs (DIFF-BEH-023) |

Les causes du point 10 n'étaient pas celle supposée seule : trois coûts « par
groupe de récursion × graphe atteignable » se cumulaient dans
`fir-prepare-normalize` (fusion des récursions isomorphes, puis invalidation du
point fixe de typage, cinq fois par compilation) et dans `fir-clock-analysis` (une
mémoire neuve par groupe à chaque tour du point fixe d'horloge). Chacun est
remplacé par une version exacte, au code généré identique sur tout le corpus de
faust-rs.

## Synthèse

| # | Problème | Nature | Gravité | Parité C++ |
|---|---|---|---|---|
| 1 | Pas de mémo des applications de fonction : coût exponentiel dans les lambdas | performance de compilation | haute | l'amont a `gApplyMemo` (#1290), la branche de référence non |
| 2 | 17 Go de mémoire pendant l'évaluation d'une voix ; compilations concurrentes 5 fois plus lentes | mémoire | haute | à mesurer côté C++ |
| 3 | Normalisation cubique des longues sommes (`greatest_divisor`), faite deux fois | performance de compilation | haute | même algorithme en C++, mais une seule passe |
| 4 | `x*x` émis en `powf(x, 2)` : appel libm dans le JIT, 7 fois plus lent | performance + parité | moyenne | le C++ émet `faustpower2_f` ; écart non documenté |
| 5 | `faustprobe --nvoices` plante si `effect` change le nombre de canaux | bug (panic) | moyenne | outil propre à faust-rs |
| 6 | `ondemand` : le travail au taux de bloc sort du domaine | performance d'exécution | moyenne | identique dans la branche C++ de référence |
| 7 | `rad` et `fad` (et `ondemand`…) sont des mots réservés | compatibilité | moyenne | le C++ 2.90.8 accepte `rad` comme identificateur ; écart non documenté |
| 8 | Moins unaire devant une primitive ou un accès : messages obscurs | diagnostic | basse | refusé aussi en C++ (parité) |
| 9 | Erreur d'arité attribuée à une ligne sans rapport | diagnostic | basse | le C++ ne donne aucune position |
| 10 | Chaîne voix + corps : compilation de 363 s contre 25 + 45 s séparément | performance de compilation | à confirmer | — |
| 11 | Panic du JIT Cranelift (« branch-offset overflow? ») sur une très grande fonction | bug | à confirmer | — |
| 12 | `-vec` sur la voix : plus de 20 minutes contre 25 à 40 s en scalaire ; planification vectorielle en O(L⁴) | performance de compilation | haute en mode vectoriel | — |
| 13 | `porting/MEMOIZATION.md` décrit à tort les environnements C++ comme hash-consés | documentation | basse | — |
| 14 | Code wasm 1,3 à 1,8 fois plus lent que le C++ du même programme compilé par Emscripten | performance d'exécution | moyenne (version web) | à comparer au wasm du C++ |
| 15 | Somme constante + commande + signal groupée autrement que dans l'amont 2.90 : partie lente non hissée, arrondi différent | performance d'exécution + parité numérique | moyenne | la référence épinglée (2.84.3) groupe comme faust-rs ; l'amont 2.90 a changé (`d4d51e5ed`) |

Les points 1 à 9 ont un reproducteur minimal. Les points 10 à 12 ont été observés
sur le programme réel ; la cause du point 12 est identifiée par échantillonnage, mais
aucun des trois n'est encore isolé en cas minimal.

---

## 1. Pas de mémo des applications : coût d'évaluation exponentiel dans les lambdas

**Constat.** Un appel de fonction répété avec les mêmes arguments est mis en cache,
sauf quand il se trouve dans le corps d'un lambda. Là, chaque application ré-évalue
l'appel, et une chaîne de profondeur D coûte 2^D.

`r01_eval_call_reuse.sh` construit `f_i(m) = f_{i-1}(m) <op> 0.5 * f_{i-1}(m)` sous
quatre formes. Temps de la phase `evaluation` (`-time`) :

| profondeur D | appel direct | via `with` | arguments composés | dans un lambda `: \(x).(…)` |
|---|---|---|---|---|
| 8 | 0,06 ms | 0,06 ms | 0,09 ms | 0,9 ms |
| 10 | 0,06 ms | 0,06 ms | 0,10 ms | 3,4 ms |
| 12 | 0,06 ms | 0,07 ms | 0,10 ms | 15,9 ms |
| 14 | 0,07 ms | 0,08 ms | 0,11 ms | 70 ms |

Les conséquences sur le programme réel :

- La voix de coopiano est écrite avec ce motif partout, par exemple
  `force_gains(…) : \(g0r, g0i, g1r, g1i).(…)`.
- Écrite avec des fonctions appelées depuis plusieurs sites, elle coûtait environ
  0,9 s d'évaluation par emplacement de mode. Elle a dû être réécrite en flot de boîtes.
- L'évaluation de la version finale prend encore 11 à 21 s ; la variation suit la
  charge de la machine.

**Reproduire.**

```bash
./r01_eval_call_reuse.sh
```

**Cause.**

- La clé de cache est `EvalCacheKey { expr: TreeId, env_key: EnvFrameKey }`
  (`crates/eval/src/environment.rs:108-111`).
- `EnvFrameKey` est l'identité de la couche d'environnement (`:100-104`, `:259-265`),
  pas son contenu.
- Toute application de fermeture pousse une couche neuve : `closure.env.push_scope()`
  (`crates/eval/src/apply.rs:112`) ; c'est aussi le cas à `apply.rs:295`.
- Le corps d'un lambda en séquence est abaissé par
  `lower_abstraction_to_symbolic_value` (`crates/eval/src/lib.rs:617-635`). Celle-ci
  l'applique à un `fresh_slot` (`:688-692`), donc dans une couche toujours nouvelle.
- Dans cette couche, `f_{i-1}(m)` a une clé jamais vue. Le résultat est de plus une
  fermeture différente, internée sur la nouvelle couche (`loop_detector.rs:584-593`).
  Le cache de `a2sb` (`lib.rs:504`) manque donc aussi, et produit 2^D copies
  alpha-équivalentes.
- Les trois autres formes trouvent le cache, parce que les deux occurrences ont le
  même `TreeId` dans la même couche.

**Faust C++.**

- Les couches C++ ne sont pas hash-consées non plus :
  `pushNewLayer → tree(unique("ENV_LAYER"), …)` (`compiler/evaluate/environment.cpp:48-52`).
- L'amont a résolu ce problème par `gApplyMemo` : `applyList(fun, larg)` est mémoïsé
  sur (fermeture hash-consée, arguments évalués) (`compiler/evaluate/eval.cpp:1293-1320`).
- Ce mémo vient du commit `6789c5da8` (#1290). Il annonce `ma.chebychev(30)` de 28,8 s
  à 0,01 s, avec un code identique sur 272 exemples.
- La branche C++ de référence de faust-rs (`8eebea429`) ne l'a pas.

**Correction proposée.**

1. Porter `gApplyMemo` dans `apply_value_list_value` (`apply.rs:74`). Pour une
   `EvalValue::Closure` d'expression `Abstr`, la clé est
   `(closure.expr, closure.env.frame_key(), larg)`. On ne stocke que les résultats
   `Box` et `Closure`, et seulement en cas de succès.
   - Pour une fonction-boîte (`Abstr` ou `Case` lus dans l'environnement de
     l'appelant, `apply.rs:295` et `:319`), ajouter `env.frame_key()` à la clé, ou ne
     mémoïser que le bras fermeture, comme le C++.
   - Les arguments sont déjà forcés en boîtes, donc la clé est sûre.
   - Une application en cours n'est pas dans le mémo et les erreurs ne sont pas mises
     en cache : la détection des boucles et de la profondeur reste inchangée.
   - Le mémo doit garder vivant le magasin `Rc` (même réserve que MEMOIZATION §2.4d).
2. Indépendamment, l'automate de filtrage est cloné en profondeur à chaque `case` :
   - au cache des automates, `lib.rs:1578-1582` ;
   - à chaque lecture d'un nom lié à un `case`, `environment.rs:346` ;
   - dans `get_pm`, `loop_detector.rs:569`.

   Il est immuable après construction. Le passer en `Rc<Automaton>` supprime les
   `Vec<Rule>::clone` et le coût de destruction vus au profilage.

**Valider.**

- `r01` doit devenir linéaire en D.
- Les sorties dorées (`xtask golden-check`) doivent rester identiques au bit près.
- La porte `compile-budget-check` doit passer.
- Ajouter une entrée à `porting/MEMOIZATION.md` §2 : clé, durée de vie, gain mesuré.

## 2. 17 Go de mémoire pendant l'évaluation ; compilations concurrentes 5 fois plus lentes

**Constat.** Compiler la voix de coopiano (`dsp/coopiano_hammer.dsp`) culmine à
17,35 Go de mémoire résidente (`/usr/bin/time -l`), avec 1,57 million de
récupérations de pages. L'évolution dans le temps :

| instant | mémoire résidente | phase |
|---|---|---|
| 6 s | 5,8 Go | évaluation |
| 12 s | 7,4 Go | évaluation |
| 18 s | 11,7 Go | évaluation |
| après 21 s | 2,8 Go | fin de l'évaluation et phases suivantes |

C'est donc l'évaluateur qui alloue. La conséquence pour des compilations
parallèles :

| compilations simultanées | durée de chacune | temps système |
|---|---|---|
| 1 | 41 s | 3,3 s |
| 3 | 216 s | 126 s (pour 50 s de temps utilisateur) |

Six compilations simultanées, lancées par un script de test, n'avaient pas fini au
bout de 22 minutes, à 19 % de CPU chacune. Les scripts de faust-coopiano ont dû
repasser en séquentiel.

**Reproduire.**

```bash
./r14_eval_memory.sh
```

Il mesure le pic de mémoire, la mémoire au cours du temps et trois compilations
simultanées.

**Cause probable.** C'est le mécanisme du point 1. Chaque application crée une couche
d'environnement, une fermeture internée sur cette couche et des copies
alpha-équivalentes. Les tables de l'évaluateur grossissent avec : cache d'évaluation,
fermetures internées, cache symbolique de `a2sb`. Elles ne sont libérées qu'à la fin
de la phase. Cela reste à confirmer par un profil mémoire (`heaptrack` ou Instruments
sur `r14`).

**Correction.**

- D'abord celle du point 1.
- Ensuite, borner ou vider les caches de l'évaluateur entre définitions
  indépendantes.
- Ajouter le pic de mémoire à la porte `compile-budget-check`, qui ne mesure
  aujourd'hui que le temps.

## 3. Normalisation cubique des longues sommes, faite deux fois

**Constat.** La phase `fir-prepare-normalize` croît comme n³ avec le nombre de termes
d'une somme. `r02_normalize_long_sum.sh` mesure n résonateurs fusionnés par `:>` :

| n | une seule somme | par paquets de 32 derrière `max(x, -1e300)` |
|---|---|---|
| 128 | 0,013 s | 0,006 s |
| 256 | 0,065 s | 0,012 s |
| 512 | 0,39 s | 0,025 s |
| 1024 | 2,94 s | 0,052 s |

Dans coopiano, les deux sommes de 732 termes de la table d'harmonie coûtaient 16 s ;
groupées, 1,6 s.

`r03_ondemand_domain_size.py` montre que la taille d'un domaine `ondemand` n'y est
pour rien : avec la même somme groupée, le coût reste linéaire avec ou sans domaine.
Cela corrige ce que nous avions d'abord écrit dans le README et l'article.

**Reproduire.**

```bash
./r02_normalize_long_sum.sh
python3 r03_ondemand_domain_size.py
```

**Cause.**

- `:>` construit la chaîne gauche `((x0+x1)+x2)+…` (`crates/propagate/src/engine.rs:1269-1291`).
- `simplify` normalise chaque `Add` partiel (`crates/normalize/src/simplify.rs:521` →
  `normalize.rs:45-67`). À chaque niveau k :
  - `Aterm::from_sig` (`aterm.rs:60-107`) ré-aplatit les k termes ;
  - `Aterm::greatest_divisor` (`crates/normalize/src/aterm.rs:252-272`) évalue
    **toutes les paires** par `gcd` et `complexity`, soit O(k²) ;
  - `normalized_tree` reconstruit la somme.
- Au total, Σk² ≈ n³/6 évaluations de paires. Dans le reproducteur, chaque terme vaut
  `1·proj_k` : toutes ces paires ont une complexité nulle et ne servent à rien.
- De plus, `prepare_signals_for_fir_unverified`
  (`crates/transform/src/signal_prepare/mod.rs:747-815`) lance `simplify` deux fois,
  avant et après `merge_iso_rec`, chacune avec un cache neuf (`normalform.rs:274-297`).

**Faust C++.** Même algorithme : `greatestDivisor` à `aterm.cpp:289-309` et
`normalizeAddTerm` à `normalize.cpp:44-66`. Il est donc aussi en O(n³), mais ne
simplifie qu'une fois (`normalform.cpp:98`). faust-rs a la même complexité et une
constante double.

**Correction proposée.**

- **A, exacte et sans effet sur les sorties.** Dans `greatest_divisor`, n'évaluer que
  les paires dont le PGCD peut être non trivial :
  - celles qui partagent un facteur avec des exposants de même signe ;
  - celles qui ont un même coefficient différent de ±1.

  Un index inversé (facteur → termes) et un regroupement par coefficient suffisent.
  Garder le même départage, à savoir la première paire strictement meilleure dans
  l'ordre de la table. Aucun nœud n'est créé : les `SigId` et l'ordre du code généré
  restent identiques.
- **B.** Sauter le deuxième `simplify` quand `merge_isomorphic_symrec_groups` n'a rien
  fusionné. Cela divise le coût par deux. Vérifier l'idempotence sur les sorties
  dorées, puisque cela rapproche faust-rs du C++, qui ne fait qu'une passe.
- **C, plus tard.** Un `Aterm` incrémental mis en cache par somme partielle. Cela
  demande des tests différentiels.
- **À éviter :** construire des sommes équilibrées dans `mix_signals`. La racine
  resterait en O(n²) et cela change les identifiants de nœuds.

## 4. `x*x` émis en `powf(x, 2)` : appel libm dans le JIT

**Constat.** `r09a_square_pow.dsp` calcule 256 carrés. faust-rs émet
`powf(fTemp0 + c, 2.0f)` 256 fois. Le Faust C++ 2.90.8 émet
`mydsp_faustpower2_f(…)`, une fonction qui renvoie `value * value`.

Sous `faustprobe`, `r09a` tourne à 19 fois le temps réel. `r09b`, le même calcul écrit
sans carré, tourne à 135 fois. Dans coopiano, il y avait 391 `pow(x, 2)` par
échantillon avant le contournement.

**Reproduire.**

```bash
$FR r09a_square_pow.dsp | grep -c powf
faust r09a_square_pow.dsp | grep -c faustpower2
$FP --in white:1 -n 441000 --quiet --time r09a_square_pow.dsp
$FP --in white:1 -n 441000 --quiet --time r09b_square_mul.dsp
```

**Cause.**

- La normalisation fait comme le C++ : `x*x` devient `pow(x, 2)`
  (`crates/normalize/src/mterm.rs:348`, `:396`, `:672`).
- Mais `leaf_emit::emit_pow` (`crates/transform/src/signal_fir/leaf_emit.rs:60-92`)
  ne développe en multiplications que les résultats **entiers** d'exposant 0 à 8.
  Pour un réel, elle appelle directement `emit_math_call2(Pow)` (`:67-69`).
- Dans Cranelift, `lower_fun_call` (`crates/codegen/src/backends/cranelift/lowering.rs:1542`)
  résout cet appel vers l'import hôte `powf`/`pow`.

**Faust C++.**

- `compiler/extended/powprim.hh:122-192` traite un exposant littéral entier de 0 à 8,
  ou réel sans partie fractionnaire, constant.
- Il génère alors un helper `<Klass>_faustpower<N>_{i|f}` dont le corps est un produit.
- C'est conditionné par `gNeedManualPow`, vrai pour C, C++, Rust, Julia, LLVM, etc.,
  et faux pour WASM, Interp, Cmajor, JSFX, Codebox et JAX (`libcode.cpp`).

L'écart n'est pas dans `porting/faust-rs-vs-faust-cpp-differences-en.md`, qui n'a
que DIFF-BEH-020, sur l'exposant à l'exécution.

**Correction proposée.**

- **A, gain immédiat dans le JIT.** Dans `lower_fun_call`, quand la fonction est
  `Pow` et que l'exposant est un littéral entier de 0 à 8 :
  - abaisser l'argument une seule fois ;
  - émettre une chaîne de `fmul` par élévation au carré.

  On peut ajouter `pow(x, 0.5)` → `sqrt`, comme `powprim.hh:110`.
- **B, parité C++.** Étendre `emit_pow` aux réels :
  - appeler `<class>_faustpower{N}_f` ;
  - déclarer le helper (`DeclareFun`) une seule fois, comme `note_int_helper`
    (`module/arithmetic.rs:83`) ;
  - garder `pow` pour les backends où le C++ le garde.

  Le helper évite de dupliquer un argument non trivial. La branche entière actuelle
  (`leaf_emit.rs:79-82`) a d'ailleurs ce défaut.
- Ajouter l'entrée au registre des différences.

## 5. `faustprobe --nvoices` plante si `effect` change le nombre de canaux

**Constat.**

- `r10_poly_effect.dsp`, une voix à 1 sortie avec `effect = *(2.0)`, fonctionne.
- `r10b_poly_effect_arity.dsp`, une voix à 2 sorties avec `effect = + : *(2.0)` (2 → 1),
  provoque `thread 'faustprobe' panicked at crates/cranelift-ffi/src/probe/engine/poly_probe.rs:559:34: index out of bounds: the len is 1 but the index is 1`.

C'est le cas de l'instrument coopiano : 5 canaux par voix, un corps qui en fait 2.
Il n'a donc pas pu être vérifié sous `faustprobe` et a demandé un rendu natif
séparé.

**Reproduire.**

```bash
$FP --nvoices 2 --note 60:100@0 -n 64 --quiet r10b_poly_effect_arity.dsp
```

**Cause.**

- `PolyProbe::assemble` fixe `outputs: voices[0].probe.outputs()` (`poly_probe.rs:256`),
  le nombre de sorties des **voix**.
- Pourtant `outputs()` est documenté comme le nombre « après l'effet » (`:332-335`).
- Les statistiques et la trame sont dimensionnées sur cette valeur (`:516`, `:521`),
  alors que `compute_with_inputs` renvoie la sortie de l'effet (`:612-615`). Le
  débordement d'indice se produit à `:559`.
- L'en-tête CSV et `--list-params` font la même hypothèse
  (`crates/cranelift-ffi/src/bin/faustprobe/poly.rs:84`, `:125`).
- Par ailleurs, l'extraction de l'effet par `environment{}` écarte en silence un effet
  dont les entrées ne correspondent pas (`:317`).

**Correction.**

- Garder deux nombres :
  - `bus_outputs = voices[0].probe.outputs()`, pour le bus de mixage seulement (`:595`) ;
  - `outputs = effect.map_or(bus_outputs, Probe::outputs)`, pour tout le reste.
- `mix_check_voice` (`crates/cranelift-ffi/src/probe/poly.rs:421`) suppose des largeurs égales : ne pas
  fusionner les deux nombres.
- Avertir quand un effet est écarté au lieu de l'ignorer.
- Ajouter `r10b` aux instantanés (`tests/output_snapshots.rs`).

**Lié : `--out` est refusé avec `--nvoices`.** Le refus vient de `refuse_scalar_only`
(`crates/cranelift-ffi/src/bin/faustprobe/poly.rs:44-52`). Le lever se ferait comme dans le chemin scalaire
(`crates/cranelift-ffi/src/bin/faustprobe/render.rs:168-176`, `:388-396`), une fois le dimensionnement corrigé.

## 6. `ondemand` : le travail au taux de bloc sort du domaine

**Constat.** `r13a_ondemand_hoist.dsp` contient
`(m != m', m) : ondemand(heavy) : *(no.noise)`, où `m` est un curseur et `heavy` une
somme de 16 `exp`·`cos`. Le C++ généré calcule les 15 `exp` **avant** la boucle
d'échantillons, donc à chaque bloc, et non quand l'horloge du domaine bat.

Dans `r13b_ondemand_held.dsp`, l'entrée passe par `ba.sAndH(chg, m)`, un signal audio.
Les `exp` restent alors dans le `if` du domaine.

coopiano utilise ce contournement, `on_change`, pour ses 96 emplacements et ses 288
coefficients de fantômes. Sans lui, la voix recalculait 11 500 fonctions
transcendantes par bloc, et elle tourne 1,8 à 2,7 fois plus vite avec.

**Reproduire.** Compter les `exp` avant et dans la boucle du code généré :

```bash
$FR r13a_ondemand_hoist.dsp
$FR r13b_ondemand_held.dsp
```

**Cause.**

- `TempVar(x)`, l'entrée d'un domaine, prend le type de `x`
  (`crates/sigtype/src/rules.rs:1249`). Une entrée de curseur reste donc `Block`.
- `place_by_variability` (`crates/transform/src/signal_fir/module/core_lowering.rs:159-187`)
  envoie tout ce qui est `Block` dans le seau de contrôle (`fSlow`), quel que soit le
  domaine ouvert (`:177-179`).

**Faust C++.** La branche de référence fait exactement pareil : le binaire de
`RUST/faust` émet `fSlow5BE = …` avant la boucle. C'est une parité de comportement.
Mais `docs/ondemand-note-en.md:155-158` promet que le corps « ne s'exécute
réellement pas », et la feuille de route
(`porting/ondemand-vec-fad-implementation-roadmap-2026-06-10-en.md:396`) a repoussé
la question à P9.

**Correction proposée.**

- **a, minimale.** Pour un signal de la charge d'un domaine `ondemand` (collectée à
  `module/clocked.rs:184-196`), traiter `Block` comme `Samp`. Garder `Konst` hissé, et
  garder le hissage pour `upsampling`/`downsampling`, où calculer une fois par bloc vaut
  mieux que H fois par échantillon.
- **c, meilleure.** Émettre le code de bloc du domaine dans sa garde, derrière un
  drapeau « déjà calculé dans ce bloc ». Le calcul se fait alors au plus une fois par
  bloc, et seulement si l'horloge bat.
- Dans les deux cas, documenter le changement comme écart volontaire au registre des
  différences, ou le proposer en amont.

## 7. `rad` et `fad` sont des mots réservés

**Constat.** `r04_rad_reserved.dsp`
(`f(x) = x * rad with { rad = 2.0; }; process = f(3);`) compile avec le Faust C++
2.90.8. faust-rs échoue avec un message qui ne dit pas pourquoi :
`Parsing error … Repair sequences found: Insert LPAR, Insert ENVIRONMENT, … Delete rad`.

`rad` est un nom courant (radians, rayon). Il nous a coûté un aller-retour dans coopiano.

**Reproduire.**

```bash
$FP -n 1 --in zero r04_rad_reserved.dsp
faust r04_rad_reserved.dsp
```

**Cause.** Le lexer réserve `fad` et `rad` (`crates/parser/src/grammar/faustlexer.l:140-141`),
ainsi que `cinputs`, `cinput`, `coutputs`, `coutput`, `ondemand`, `upsampling` et
`downsampling` (`:134-144`). Les règles de grammaire sont à `faustparser.y:725-735`.

**Faust C++.**

- La branche de référence réserve `ondemand`, `upsampling` et `downsampling`, mais pas
  `fad`, `rad` ni `cinput*`.
- Le 2.90.8 amont ne réserve même pas `ondemand` : `ondemand = 1;` compile.
- Le registre des différences documente `cinput*` (DIFF-SRC-004), mais ni `fad`/`rad`
  (DIFF-SRC-001/002), ni `ondemand` et ses voisins face à l'amont.

**Correction.**

- **Rapide.** Un diagnostic dans `build_engine_parse_diagnostics`
  (`crates/parser/src/lib.rs:2510-2530` a un précédent pour `ffunction`). Quand le
  jeton inattendu ou le précédent est un mot réservé propre à faust-rs, afficher :
  « `rad` est un mot réservé de faust-rs (primitive de différentiation inverse
  `rad(expr, seeds)`) ; le Faust C++ l'accepte comme identificateur ; renommez-le ».
  Proposer le renommage en `rad_`.
- **Propre.** Des mots-clés contextuels :
  - retirer `fad` et `rad` du lexer ;
  - analyser `fad(a, b)` comme une application ordinaire ;
  - dans l'évaluateur, les traiter comme des primitives seulement si le nom n'est pas
    lié et reçoit deux arguments.

  Une définition utilisateur les masque alors, et `controls.lib` et `optimizers.lib`
  continuent de fonctionner.
- Compléter le registre des différences.

## 8. Moins unaire devant une primitive ou un accès : messages obscurs

**Constat.**

| source | faust-rs | Faust C++ |
|---|---|---|
| `-max(1, 2)` (`r05a`) | `Repair: Delete max` | refusé |
| `exp(-sin(0.5))` (`r05b`) | `Repair: Delete sin` | refusé |
| `exp(-L.g(2, k))`, `L` une bibliothèque (`r05c`) | `access requires a captured closure value` (FRS-EVAL-0099), sans position | `no environment to access : 0,L : -.g` |

Le refus est conforme au langage : le `-` unaire ne s'applique qu'à un identificateur
ou à un nombre. Le défaut est dans le message.

Le troisième cas nous a d'abord fait croire à un bug de portée des bibliothèques.
`-L.g(2, k)` se lit en effet `((0 - L).g)(2, k)`.

**Reproduire.**

```bash
for f in r05a_minus_max r05b_minus_sin r05c_minus_access; do $FP -n 1 --in zero -I . $f.dsp; done
```

**Cause.**

- La grammaire n'accepte que `SUB IdentExpr` (`faustparser.y:755`).
- L'erreur d'accès vient d'`eval_access_value` (`crates/eval/src/lib.rs:1358-1373`).
- `binary_prim` (`crates/parser/src/lib.rs:1213`) n'enregistre pas la position du `-`.

**Correction.**

- Quand le jeton précédent est `-` et que le suivant est une primitive ou `(`, ajouter
  une note : « le `-` unaire ne s'applique qu'à un nom ou à un nombre ». Proposer
  `(0 - max(1, 2))`.
- **Ne pas** proposer `-(max(1, 2))`, qui est l'application partielle `_ - 2`.
- Dans `eval_access_value`, reconnaître `seq(par(0, X), Sub)` et dire : « le moins
  unaire porte sur `L` seul ; écrivez `0 - L.g(2, k)` ».
- Enregistrer la position du `SUB`.

## 9. Erreur d'arité attribuée à une ligne sans rapport

**Constat.** `r08b_arity_attribution_lambda.dsp` contient une erreur ligne 4 :
`bad = m(1) : \(a, b).(a), m(2) : \(a, b).(b);`. Elle se lit
`m(1) : (\(a, b).(a), m(2)) : \(a, b).(b)` à cause de la précédence de `,` sur `:`.

faust-rs la signale en `3:33`, sur la virgule de `(_, _)` dans la définition de `m` à
la ligne 3. `r08` se comporte pareil : il signale la virgule de `pair = (1, 2)`. Dans
coopiano, l'erreur pointait dans la réverbération pour une faute dans la table
d'harmonie. Le C++ ne donne aucune position.

**Reproduire.**

```bash
$FP -n 1 --in zero r08b_arity_attribution_lambda.dsp
```

**Cause.**

- Le nœud fautif est construit pendant l'évaluation et n'a pas de position.
- Le repli de `maybe_add_source_label` (`crates/compiler/src/diagnostic_enrichment.rs:143-150`)
  appelle `source_span_from_node_or_descendant` (`:471-499`). Celle-ci prend la première
  position trouvée en profondeur, ici un `par(_, _)` partagé par hash-consing et situé
  sur sa virgule (`crates/parser/src/lib.rs:1148-1157`).

**Correction.**

- **Petite.** Utiliser `source_span_from_node_or_unique_descendant` (`:320-356`) dans
  ce repli, comme le chemin d'évaluation depuis le correctif #21 (`:252-259`). Mieux
  vaut aucune ligne qu'une ligne fausse.
- **Propre.** Dans `eval_seq_value` (`crates/eval/src/lib.rs:1275-1299`) et ses
  voisines, enregistrer « nœud construit → nœud source » dans une table annexe, et ne
  donner une position que si l'origine est unique.

## 10. Chaîne voix + corps : compilation superlinéaire

**Constat.** Compilés séparément, la voix (`coopiano_voice_out.dsp`) prend environ
25 s et le corps (`coopiano_body.dsp`) environ 45 s. Compilés comme un seul programme
`voice_out : body`, il fallait 363 s, alors que les sommes longues étaient déjà
groupées.

**Hypothèse, à vérifier.**

- `rec_merge::open_symrec` (`crates/normalize/src/rec_merge.rs:43-48`) prend un cache
  neuf par groupe.
- Il descend dans les corps de `symrec` imbriqués (`:98-126`).
- Il est donc en O(groupes × taille atteignable) quand les récursions sont chaînées.
  La chaîne complète a plus de 2 000 groupes de récursion : modes, résonateurs, table.

**Reproduire.** Il faut d'abord isoler un cas minimal, par exemple une chaîne de G
récursions séparées par des sommes, en mesurant `fir-prepare-normalize` et ses
sous-étapes. Le programme réel est `voice_out_drawn(…) : body`.

## 11. Panic du JIT Cranelift sur une très grande fonction `compute`

**Constat.** Une version intermédiaire de la voix a échoué après 435 s de
compilation. Elle avait 96 emplacements et 288 paires de fantômes, chacune avec des
sélections entre trois candidats. Le message était :
`cranelift backend code generation failed: Cranelift JIT panicked while compiling note_test::compute (branch-offset overflow?); strict mode refuses the no-op fallback`.

**Non reproduit en minimal.** 16 000 récursions, ou 8 000 coefficients au taux de bloc
consommés par 8 000 récursions, compilent sans erreur. Il faut l'état exact du
programme pour isoler ce cas. Le message suggère une limite de déplacement de branche
dans une fonction géante. Faute de correction, le découpage de `compute` en plusieurs
fonctions serait la parade.

## 12. `-vec` sur la voix : compilation interminable (planification vectorielle en O(L⁴))

**Constat.** `faustprobe --double -vec -vs 32 -I dsp -n 2000 … dsp/coopiano_hammer.dsp`
tournait encore après 20 minutes, à 99 % de CPU et avec seulement 185 Mo de mémoire.
Nous l'avons arrêté. La même compilation en scalaire prend 25 à 40 s. Un essai
antérieur sur le corps de l'instrument n'avait rien produit non plus.

**Cause, d'après un échantillonnage du processus** (`sample`, 3 s). Tout le temps est
dans `transform::signal_fir::vector::plan::build::build_vector_plan` et
`producer_reachability::PlanReachability::{reaches, add_edge}`.

- `build_vector_plan` (`crates/transform/src/signal_fir/vector/plan/build.rs:~991-1010`)
  parcourt **toutes les paires** des L boucles.
- Pour chaque paire dont les effets sont en conflit et qui n'est pas encore ordonnée,
  il ajoute une arête d'effet. `PlanReachability::add_edge`
  (`crates/transform/src/signal_fir/vector/plan/producer_reachability.rs:50-60`) met
  alors à jour la fermeture transitive :
  - il clone une ligne de L bits ;
  - il fait un OU dans chaque ligne qui atteint la source : O(L²/64).
- La construction initiale (`new`, `:21-44`) est un Floyd–Warshall en bits : O(L³/64).
- Au pire, l'ensemble est en O(L⁴/64). La voix compte plusieurs centaines de boucles :
  par emplacement, deux modes, leurs domaines et les paires de fantômes.

**Correction proposée.**

- Les arêtes ajoutées respectent toujours le même ordre topologique stable
  (`position`). Ordonner deux boucles en conflit revient donc à les chaîner dans cet
  ordre.
- On peut alors grouper les boucles par ressource d'effet (état, table, sortie), les
  trier par position et n'ajouter que les arêtes entre voisines consécutives de chaque
  groupe. La fermeture de ces chaînes contient toutes les paires que la boucle actuelle
  ordonne, sans requête d'accessibilité : O(L log L) par ressource au lieu de O(L⁴).
- À défaut, ne mettre à jour la fermeture qu'en fin de passe, et dédupliquer les paires
  par composante.
- Valider en comparant les plans (`plan_hash`) avant et après sur le corpus `-vec`.

## 13. Inexactitude dans `porting/MEMOIZATION.md`

Les §2.4c (ligne 331) et §3.7 (ligne 1701) affirment que le C++ hash-conse ses
environnements. Le code C++ dit le contraire :
`pushNewLayer → tree(unique("ENV_LAYER"), …)` (`compiler/evaluate/environment.cpp:48-52`).

Ce n'est pas l'égalité des couches qui rend le C++ rapide, c'est `gApplyMemo`
(point 1). Une entrée qui décrit à tort la parité C++ risque d'orienter une
correction dans la mauvaise direction (§3.7).

## 14. Le code wasm est 1,3 à 1,8 fois plus lent que le C++ compilé par Emscripten

Constaté le 16 octobre au soir, en écrivant la version web (`web/`, `make web`),
avec faust-rs `main-dev` à `354e2080`.

**Constat.** `make web` compile la voix et les deux corps par
`faust-rs -lang wasm -double`. Les sorties sont celles de faustprobe : -296 dB de la
crête pour la voix, -270 dB pour les corps (`make web-check`). Le coût d'une seconde
de son, en régime établi (après deux secondes, quand V8 a remplacé Liftoff par
TurboFan), sous node 22 sur l'Apple M5, entrées des corps constantes, pédale levée :

| DSP | wasm de faust-rs | C++ de faust-rs, `em++ -O3` | natif, clang -O3 |
|---|---|---|---|
| voix (une note tenue) | 7,4 à 7,8 % | 5,7 % | 3,1 % |
| corps léger | 36 à 41 % | 20 % | 10 % |
| corps imagé | 87 à 95 % | 49 % | 36 % |

Le corps imagé ne tient donc pas en temps réel dans un navigateur, et la page
démarre avec le corps léger. Les deux colonnes wasm exécutent le même programme
dans le même moteur : l'écart ne tient qu'au code émis.

**Reproducteur.** `r15_wasm_speed.sh` (`make web-check`). La colonne Emscripten
vient d'un banc jetable : le C++ de `-lang cpp -double`, les classes appelées par
deux fonctions exportées, `em++ -O3`, emscripten de MacPorts avec
`EMSDK_PYTHON` sur un Python 3.13.

**Cause.** Non établie ; le code wasm n'a pas été examiné. Deux mesures
diraient où chercher :

- passer `wasm-opt -O3` sur le module de faust-rs : ce qu'un optimiseur générique
  récupère sépare le code émis (locales, chargements répétés) de ce qui demande
  une analyse propre à Faust ;
- compter les accès mémoire de la boucle de `compute` (`wasm-objdump -d`), contre
  ceux du module Emscripten : LLVM garde les états de récursion dans des registres
  le temps d'un échantillon.

**Correction possible.** Le backend wasm du C++ sert de référence de parité : le
comparer sur un DSP que les deux compilent, avant de viser Emscripten.

**Mise à jour du 16 octobre, 22 h.** faust-rs `main-dev` à `51642a20` (« wasm:
constant struct addresses go in the memarg offset (W1) ») place les adresses
constantes de la structure dans le décalage des instructions de chargement et
d'écriture. Reconstruit avec lui (`make web`), le wasm de coopiano donne les mêmes
sorties (-296 dB pour la voix, -272 dB pour les corps) et coûte, sur deux passes
alternées avec l'ancienne construction, machine chargée (charge 4 à 5) :

| DSP | avant (`354e2080`) | `51642a20` | C++ de faust-rs, `em++ -O3` |
|---|---|---|---|
| voix (une note tenue) | 7,9 à 8,3 % | 5,9 à 6,2 % | 5,7 % |
| corps léger, pédale levée | 40 à 41 % | 30 à 31 % | 20 % |
| corps léger, pédale enfoncée | 91 à 92 % | 62 à 65 % | — |
| corps imagé, pédale levée | 96 à 100 % | 50 % | 49 % |
| corps imagé, pédale enfoncée | 152 à 156 % | 92 à 96 % | — |

La voix et le corps imagé rejoignent Emscripten ; le corps léger reste 1,5 fois
plus lent. Le point reste donc ouvert pour lui.

## 15. Une somme constante + commande + signal est groupée autrement que dans l'amont

Constaté le 16 octobre au soir, en cherchant pourquoi le corps de la version web
restait à son coût « pédale enfoncée » après le relâchement de la pédale.

**Constat.** Sur `r16_sum_grouping.dsp`, `o + max(-st, min(st, 1 - c - o))` avec
`c` un curseur, `o` la récursion :

- Faust amont 2.90.10 (`/usr/local/bin/faust`, et non 2.90.8 comme écrit d'abord)
  émet `fRec0[1] + max(-fSlow0, min(fSlow0, fSlow1 - fRec0[1]))`, avec
  `fSlow1 = 1 - c` calculé une fois par bloc ;
- faust-rs émet `fRec0 + fmax(fSlow2, fmin(fSlow1, (1.0 - fRec0) - fSlow0))`, et
  dans `coopiano.lib` `1.0 - (fRec0 + fSlow4)`.

Deux conséquences :

- une soustraction de plus par échantillon, la partie lente n'étant plus hissée ;
- un autre arrondi. Avec `c = 1`, la récurrence du C++ atteint 0 exactement ; celle
  de faust-rs s'arrête à l'erreur d'arrondi de `1 - o`, 1,1e-17 en double et
  1,1e-8 en simple (`FP --double … r16_sum_grouping.dsp`).

Dans coopiano, l'ouverture des étouffoirs de la résonance sympathique (`_res_open`)
ne revenait donc jamais à 0. Le test `o > 0` gardait éveillés les 69 domaines
`ondemand` des touches étouffées dès la première pédale. Le corps léger restait à
87 % d'un cœur en wasm au lieu de 40 %, et en natif la partition de démonstration
coûtait 22 % au lieu de 15 %. Le son n'en dépendait pas, l'ouverture résiduelle
valant 1e-17. `coopiano.lib` 0.2.1 contourne le défaut avec un seuil
(`_RES_SEATED = 1e-9`).

**Cause.** Établie le 16 au soir : ce n'était pas une divergence de faust-rs. La
branche C++ de référence épinglée (`8eebea429`, 2.84.3) imprime la même forme
normale que faust-rs (`-norm` : `-(-(1, o), c)`). C'est l'amont qui a changé après
elle, par le commit `d4d51e5ed` de Yann Orlarey (9 août 2026) : un cinquième ordre,
« audio-récursif » (le bit `kContainsRec`, « un état m'atteint »), dont les termes
rejoignent la somme en dernier, comme opérande de droite. Mesure de l'amont :
156 programmes touchés, 136 identiques au bit près, 20 arrondis (au plus 2e-5), des
gains jusqu'à ×0,74 sur les filtres Oberheim.

**Correction.** Portée dans faust-rs par le commit `8886a772` (branche de travail,
à intégrer à `main-dev`) : le bit `TreeArena::contains_recursion`, la jonction
tardive dans `Aterm::normalized_tree` et le poids de `Mterm::complexity`, comme
l'amont ; entrée DIFF-BEH-023 du registre. `r16` donne désormais
`fSlow0 = 1 - c` et `fSlow0 - fRec0`, et la récurrence atteint 0,0. Sur les 632
programmes du corpus de faust-rs, 210 changent de code, et faustprobe donne :

- 191 programmes identiques au bit près ;
- 12 qui ne diffèrent que d'arrondis ;
- 3 sensibles à l'arrondi.

Les impulse-tests n'ont aucun nouvel échec, et `make engine` donne ici les mêmes
chiffres. Le seuil `_RES_SEATED` de `coopiano.lib` 0.2.1 devient inutile avec ce
compilateur. Il est sans effet sur le son, et il est gardé tant que `main-dev`
n'a pas intégré le correctif.

---

## Remarque : le délai par défaut du CLI

Le `--timeout 120` par défaut de `faust-rs` (`crates/compiler/src/cli/args.rs:278-279`)
interrompt des compilations légitimes : celle du corps de coopiano a été coupée à
120 s. Le C++ a le même délai par défaut, donc c'est une parité. `faustprobe` n'a pas
de délai. Ce n'est qu'à signaler dans la documentation des gros programmes, avec
`--timeout 0`.

## Ordre de correction suggéré

1. **Point 1 (mémo des applications).** Il règle aussi très probablement le point 2,
   et c'est un port d'un correctif C++ éprouvé.
2. **Point 3 A et B.** C'est local à `aterm.rs` et `signal_prepare`, et sans effet sur
   les sorties pour A.
3. **Point 5.** Petit correctif ; il rend `faustprobe` utilisable sur un instrument
   avec effet.
4. **Point 4 A,** puis B avec l'entrée du registre.
5. **Points 7 à 9,** des diagnostics à faible risque.
6. **Point 6,** une décision de conception à documenter.
7. **Point 12 (chaînage par ressource),** puis isoler les points 10 et 11.
