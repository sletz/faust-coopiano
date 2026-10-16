# faust-coopiano

[English version](README.md)

Un modèle Faust de [coopiano](../../coopiano), le piano à modélisation physique
de `piano.hpp` / `instrument.hpp` (C++17, MIT) : marteau, cordes à l'unisson à
deux polarisations, partiels fantômes longitudinaux, bruits de mécanique,
étouffoirs et pédale forte, résonance sympathique, table d'harmonie modale avec
imagerie par régions du chevalet, et la réverbération de `reverb.hpp`. Écrit
pour [faust-rs](../faust-rs) et vérifié avec son `faustprobe` contre le modèle
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
```

`COOPIANO` et `FAUST_RS` désignent les deux dépôts (par défaut `../../coopiano`
et `../faust-rs`, avec `faust-rs` et `faustprobe` compilés en release). Avec le
faust-rs `main-dev` du 16 octobre 2026, la voix compile en 8 s environ et le corps
en 5 s (25 s et 45 s la veille ; voir *faust-rs*). `JOBS` (4 par défaut) fixe le
nombre de rendus que `make contact`, `notes` et `keyboard` lancent en parallèle.

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
- **Corps.** La résonance sympathique est `SympatheticResonance` (88 touches,
  partiels sous 7 kHz), la part de la touche jouée retirée par une correction
  dans la voix (`own_drive`) ; les touches à étouffoir tournent dans des
  domaines `ondemand` qui dorment tant que les étouffoirs restent posés. La
  table d'harmonie est un banc des 732 modes de la table C++ dont les amplitudes
  complexes sont ajustées, par moindres carrés avec une matrice de Gram en forme
  close, aux réponses d'`Engine` pour chaque région du chevalet (tête et queue
  partagée) ; un mode est excité par `sum_r A_r x_r`. La salle est
  `StereoReverb` ligne à ligne.

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
| Coût natif (clang -O3, `results/cost.txt`) | 2,9 % d'un cœur par voix qui sonne ; corps 36 % (pédale levée) à 45 % (pédale enfoncée) ; corps léger 10 % à 22 % |

## Différences connues

- **Partiels par corde** : 32 pour un triple chœur ; un do 3 perd le contenu C++
  au-delà de 4,5 kHz (au plus -44 dB de l'énergie, à l'attaque) ; `NS = 144`
  donne 48 partiels par corde pour 1,5 fois le coût d'une voix.
- **Marteau à 44,1 kHz** au lieu de 32 fois plus : exact à 1 % sauf pour les
  contacts les plus courts de l'aigu (do 8 fortissimo).
- **Fantômes** : distance entre partenaires jusqu'à 2 (`piano.hpp` : 3, le terme
  suivant est 15 dB plus bas) ; la borne d'amplitude par paire
  (`bound_phantom`) et le seuil à -80 dB ne sont pas appliqués.
- **Tirages aléatoires** : l'écart de lecture des cordes à l'unisson est tiré à
  chaque frappe (les tests imposent les tirages de la graine C++) ; les bruits
  de mécanique sont d'autres réalisations du même bruit filtré ; le léger
  désaccord de la seconde polarisation vient d'un hachage.
- **Niveau des bruits** : issu du contact pour le réglage par défaut ; d'autres
  réglages du marteau modifient exactement les cordes mais seulement
  approximativement les bruits de mécanique.
- **Résonance sympathique** : ouverte par la pédale et par l'aigu sans
  étouffoirs ; les cordes d'une touche tenue sans être jouée ne s'ouvrent pas
  (une voix ne voit pas les autres).
- **Table d'harmonie** : imagerie figée aux valeurs C++ par défaut (spread 0,7,
  position_depth 0,5) et réglages de la table figés à `default.ini`
  (`make tables` après les avoir changés dans `ref/dump.cpp`) ; la fin de queue
  après un relâchement (plus de 60 dB sous la note) est moins bien ajustée.
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
`ondemand` si son entrée n'est pas tenue au taux audio, d'où `on_change`.
