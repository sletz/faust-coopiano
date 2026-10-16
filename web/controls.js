// The controls of coopiano, as the page shows them: groups in the order of
// default.ini, each control with its unit and an explanation in English and
// French. Keys are the Faust addresses without the program name
// (controlKey in faust-wasm-dsp.js); ranges and defaults come from the JSON
// of the compiled DSPs, not from here.

export const GROUPS = [
  {
    id: "hammer",
    title: { en: "Hammer", fr: "Marteau" },
    intro: {
      en: "The felt hammer is solved implicitly at the audio rate against the strings: the felt law F = K·d^p·(1 + 0.12·d′) meets the strings' response at every sample, five Newton steps each. These controls change the strike itself, hence the attack and the spectrum of every note.",
      fr: "Le marteau de feutre est résolu implicitement au taux audio contre les cordes : la loi du feutre F = K·d^p·(1 + 0,12·d′) rencontre la réponse des cordes à chaque échantillon, en cinq pas de Newton. Ces réglages changent la frappe elle-même, donc l'attaque et le spectre de chaque note.",
    },
    controls: {
      "hammer/stiffness_scale": {
        name: { en: "Felt stiffness", fr: "Raideur du feutre" },
        help: {
          en: "Scales the felt stiffness K. A harder felt makes a shorter contact that excites more high partials: brighter, more percussive. A softer felt gives a rounder, darker strike.",
          fr: "Multiplie la raideur K du feutre. Un feutre plus dur fait un contact plus court qui excite plus de partiels aigus : son plus brillant, plus percussif. Un feutre plus doux donne une frappe plus ronde et plus sombre.",
        },
      },
      "hammer/mass_scale": {
        name: { en: "Hammer mass", fr: "Masse du marteau" },
        help: {
          en: "Scales the hammer mass. A heavier hammer stays longer on the string and puts more energy into the low partials (fuller, darker); a lighter one sounds thinner and brighter.",
          fr: "Multiplie la masse du marteau. Un marteau plus lourd reste plus longtemps sur la corde et met plus d'énergie dans les partiels graves (son plus plein, plus sombre) ; un plus léger sonne plus mince et plus brillant.",
        },
      },
      "hammer/felt_width_scale": {
        name: { en: "Contact width", fr: "Largeur de contact" },
        help: {
          en: "Width of the felt's contact along the string. A wider contact averages the mode shapes over the strike zone and filters out the high partials: a softer tone.",
          fr: "Largeur du contact du feutre le long de la corde. Un contact plus large moyenne les formes de modes sur la zone de frappe et filtre les partiels aigus : timbre plus doux.",
        },
      },
      "hammer/maximum_velocity_mps": {
        name: { en: "Top hammer speed", fr: "Vitesse maximale" },
        unit: "m/s",
        help: {
          en: "Hammer speed reached at velocity 1 (MIDI 127): the loudness and brightness of fortissimo.",
          fr: "Vitesse du marteau atteinte à la vélocité 1 (MIDI 127) : le niveau et la brillance du fortissimo.",
        },
      },
      "hammer/velocity_exponent": {
        name: { en: "Velocity curve", fr: "Courbe de vélocité" },
        help: {
          en: "Hammer speed = top speed × velocity^exponent. A larger exponent widens the soft range (light touches play softer); a smaller one compresses the dynamics.",
          fr: "Vitesse du marteau = vitesse maximale × vélocité^exposant. Un exposant plus grand élargit les nuances douces (un toucher léger joue plus doucement) ; un plus petit comprime la dynamique.",
        },
      },
    },
  },
  {
    id: "strings",
    title: { en: "Strings", fr: "Cordes" },
    intro: {
      en: "Each key has one, two or three strings (one below G1, two below F2), each a bank of modes with two polarizations: a vertical one that decays fast and a horizontal one, slightly detuned, that decays slowly. That is the two-stage decay of a real piano. A voice has 96 mode slots shared by its strings.",
      fr: "Chaque touche a une, deux ou trois cordes (une sous sol 1, deux sous fa 2), chacune un banc de modes à deux polarisations : une verticale qui s'éteint vite et une horizontale, légèrement désaccordée, qui s'éteint lentement. C'est la double décroissance d'un vrai piano. Une voix a 96 emplacements de modes partagés par ses cordes.",
    },
    controls: {
      "strings/decay_scale": {
        name: { en: "Sustain", fr: "Tenue" },
        help: {
          en: "Scales the late decay time (T60) of the fundamental: how long a held note sings.",
          fr: "Multiplie le temps de décroissance tardif (T60) du fondamental : combien de temps une note tenue chante.",
        },
      },
      "strings/treble_decay_scale": {
        name: { en: "Treble sustain", fr: "Tenue de l'aigu" },
        help: {
          en: "Decay time of the treble, blended in from C6 to F#6 and applied fully above: how long the top octave rings.",
          fr: "Temps de décroissance de l'aigu, introduit progressivement de do 6 à fa# 6 et appliqué entièrement au-dessus : combien de temps sonne l'octave supérieure.",
        },
      },
      "strings/partial_loss_scale": {
        name: { en: "High-partial loss", fr: "Pertes des aigus" },
        help: {
          en: "Scales the loss that grows with the square of frequency. Higher values make the upper partials die sooner: the sustain gets darker faster.",
          fr: "Multiplie la perte qui croît comme le carré de la fréquence. Plus elle est forte, plus les partiels aigus s'éteignent tôt : la tenue s'assombrit plus vite.",
        },
      },
      "strings/inharmonicity_scale": {
        name: { en: "Inharmonicity", fr: "Inharmonicité" },
        help: {
          en: "String stiffness B: partial n sits at n·f0·√(1 + B·n²), stretched above the harmonic series. 0 is an ideal string; larger values sound more metallic, especially in the bass.",
          fr: "Raideur B de la corde : le partiel n est à n·f0·√(1 + B·n²), étiré au-dessus de la série harmonique. 0 est une corde idéale ; au-delà le son devient plus métallique, surtout dans le grave.",
        },
      },
      "strings/unison_detune_scale": {
        name: { en: "Unison detune", fr: "Désaccord des unissons" },
        help: {
          en: "Detuning between the two or three strings of a key (per-key random draws of the C++ model). It makes the beating and the chorus of the sound; 0 gives perfectly tuned unisons, high values a honky-tonk.",
          fr: "Désaccord entre les deux ou trois cordes d'une touche (tirages par touche du modèle C++). Il fait les battements et le chorus du son ; 0 donne des unissons parfaitement justes, les fortes valeurs un « honky-tonk ».",
        },
      },
      "strings/treble_unison_detune": {
        name: { en: "Treble detune floor", fr: "Désaccord minimal de l'aigu" },
        help: {
          en: "Minimum unison detuning in the treble, blended in from G5 to C6: keeps some life in the short treble notes.",
          fr: "Désaccord minimal des unissons dans l'aigu, introduit de sol 5 à do 6 : garde un peu de vie dans les notes aiguës, qui sont courtes.",
        },
      },
      "strings/fast_decay_scale": {
        name: { en: "Prompt decay ratio", fr: "Rapport de décroissance rapide" },
        help: {
          en: "How much faster the vertical polarization decays than the horizontal one. Larger values give a more pronounced two-stage decay: a quick drop after the attack, then a long aftersound.",
          fr: "De combien la polarisation verticale s'éteint plus vite que l'horizontale. Plus la valeur est grande, plus la double décroissance est marquée : une chute rapide après l'attaque, puis une longue résonance.",
        },
      },
      "strings/horizontal_ratio": {
        name: { en: "Aftersound level", fr: "Niveau de la résonance" },
        help: {
          en: "Amplitude of the slow horizontal polarization relative to the prompt one: the level of the aftersound that remains once the attack has decayed.",
          fr: "Amplitude de la polarisation horizontale lente par rapport à la rapide : le niveau de la résonance qui reste une fois l'attaque éteinte.",
        },
      },
      "strings/longitudinal_gain": {
        name: { en: "Phantom partials", fr: "Partiels fantômes" },
        unit: "/N",
        help: {
          en: "Longitudinal coupling of the string: pairs of partials add components at their sum frequencies (keys below G#3). It grows with the force, so it is the metallic edge of a loud bass note; 0 removes it.",
          fr: "Couplage longitudinal de la corde : des paires de partiels ajoutent des composantes à la somme de leurs fréquences (touches sous sol# 3). Il croît avec la force : c'est le mordant métallique d'une basse jouée fort ; 0 le supprime.",
        },
      },
      "strings/bridge_coupling": {
        name: { en: "Bridge coupling", fr: "Couplage au chevalet" },
        help: {
          en: "Coupling of the strings to the soundboard's admittance at the bridge: it pulls the partials' frequencies and drains the modes that fall near a board resonance faster. 0 is a rigid bridge.",
          fr: "Couplage des cordes à l'admittance de la table au chevalet : il déplace la fréquence des partiels et vide plus vite les modes proches d'une résonance de la table. 0 est un chevalet rigide.",
        },
      },
    },
  },
  {
    id: "tone",
    title: { en: "Tone", fr: "Timbre" },
    intro: {
      en: "Voicing equalizers applied to how the bridge reads each partial (not to the output signal): they change the balance of the partials while keeping their decays.",
      fr: "Égaliseurs d'harmonisation appliqués à la façon dont le chevalet lit chaque partiel (pas au signal de sortie) : ils changent l'équilibre des partiels sans toucher à leurs décroissances.",
    },
    controls: {
      "tone/fundamental_boost_db": {
        name: { en: "Fundamental boost", fr: "Renfort du fondamental" },
        unit: "dB",
        help: {
          en: "Raises or lowers the fundamental, most strongly between A2 and A3.",
          fr: "Renforce ou atténue le fondamental, surtout entre la 2 et la 3.",
        },
      },
      "tone/lower_overtone_cut_db": {
        name: { en: "Lower-overtone cut", fr: "Atténuation des premiers harmoniques" },
        unit: "dB",
        help: {
          en: "Cuts the overtones around 220–1000 Hz (tapered from 160 to 2000 Hz): less boxy, clearer middle register.",
          fr: "Atténue les harmoniques autour de 220–1000 Hz (avec des transitions de 160 à 2000 Hz) : medium plus clair, moins « boîte ».",
        },
      },
      "tone/bridge_curve_scale": {
        name: { en: "Bridge EQ depth", fr: "Profondeur de l'égaliseur du chevalet" },
        help: {
          en: "Depth of the register-dependent bridge equalization of the C++ model: 1 as voiced, 0 flat, 2 exaggerated.",
          fr: "Profondeur de l'égalisation du chevalet selon le registre, celle du modèle C++ : 1 tel qu'harmonisé, 0 plat, 2 exagéré.",
        },
      },
      "tone/mid_gain_db": {
        name: { en: "Bell EQ gain", fr: "Gain de la cloche" },
        unit: "dB",
        help: {
          en: "Gain of a bell-shaped equalizer on the partials; 0 dB disables it. The default slightly softens the presence region.",
          fr: "Gain d'un égaliseur en cloche sur les partiels ; 0 dB le désactive. La valeur par défaut adoucit légèrement la zone de présence.",
        },
      },
      "tone/mid_frequency_hz": {
        name: { en: "Bell EQ frequency", fr: "Fréquence de la cloche" },
        unit: "Hz",
        help: { en: "Centre frequency of the bell equalizer.", fr: "Fréquence centrale de l'égaliseur en cloche." },
      },
      "tone/mid_width_octaves": {
        name: { en: "Bell EQ width", fr: "Largeur de la cloche" },
        unit: "oct",
        help: {
          en: "Width of the bell, the standard deviation of a Gaussian in octaves.",
          fr: "Largeur de la cloche, l'écart type d'une gaussienne en octaves.",
        },
      },
    },
  },
  {
    id: "resonance",
    title: { en: "Sympathetic resonance", fr: "Résonance sympathique" },
    intro: {
      en: "The strings of all 88 keys (up to 16 partials each, below 7 kHz) are driven by the total bridge force. Each played key's own share is withheld from its own resonators. Keys with dampers resonate only while the pedal lifts the dampers; keys from F#6 up have none and always ring. Their output is spread evenly over the soundboard.",
      fr: "Les cordes des 88 touches (jusqu'à 16 partiels chacune, sous 7 kHz) sont excitées par la force totale au chevalet. La part de chaque touche jouée est retirée de ses propres résonateurs. Les touches à étouffoir ne résonnent que lorsque la pédale lève les étouffoirs ; à partir de fa# 6, il n'y a pas d'étouffoir et les cordes résonnent toujours. Leur sortie est répartie également sur la table.",
    },
    controls: {
      "resonance/gain": {
        name: { en: "Resonance level", fr: "Niveau de résonance" },
        help: {
          en: "Level of the sympathetic register; 0 bypasses it exactly.",
          fr: "Niveau de la résonance sympathique ; 0 la contourne exactement.",
        },
      },
      "resonance/maximum_decay_seconds": {
        name: { en: "Open-string decay cap", fr: "Plafond de décroissance ouverte" },
        unit: "s",
        help: {
          en: "Upper limit of the decay time (T60) of an undamped sympathetic string: how long the halo lasts with the pedal down.",
          fr: "Limite du temps de décroissance (T60) d'une corde sympathique libre : combien de temps dure le halo pédale enfoncée.",
        },
      },
      "resonance/damper_decay_seconds": {
        name: { en: "Damped-string decay", fr: "Décroissance étouffée" },
        unit: "s",
        help: {
          en: "Decay time of a sympathetic string with its damper seated. A key's resonators stop being computed six such times after the dampers seat.",
          fr: "Temps de décroissance d'une corde sympathique étouffée. Les résonateurs d'une touche cessent d'être calculés six fois ce temps après la pose des étouffoirs.",
        },
      },
      "resonance/transition_seconds": {
        name: { en: "Damper transition", fr: "Transition des étouffoirs" },
        unit: "s",
        help: {
          en: "How fast the dampers of the sympathetic register lift and seat when the pedal moves.",
          fr: "Vitesse à laquelle les étouffoirs de la résonance sympathique se lèvent et se posent quand la pédale bouge.",
        },
      },
      "resonance/own_drive": {
        name: { en: "Own-key drive", fr: "Excitation de sa propre touche" },
        help: {
          en: "Share of a key's force that drives its own sympathetic resonators. 0 (the C++ default) withholds it; 1 lets a key excite a beating copy of itself.",
          fr: "Part de la force d'une touche qui excite ses propres résonateurs sympathiques. 0 (la valeur du C++) la retire ; 1 laisse une touche exciter une copie d'elle-même, qui bat avec elle.",
        },
      },
    },
  },
  {
    id: "reverb",
    title: { en: "Room", fr: "Salle" },
    intro: {
      en: "The StereoReverb of the C++ model: the wet path is high-passed at 150 Hz and predelayed. Six early reflections between 7 and 31 ms feed two diffusion all-passes per side, then eight delay lines with a Walsh–Hadamard feedback. It is added to the unchanged dry sound.",
      fr: "La StereoReverb du modèle C++ : le signal d'effet est filtré en passe-haut à 150 Hz et retardé. Six premières réflexions entre 7 et 31 ms alimentent deux passe-tout de diffusion par côté, puis huit lignes à retard avec un retour de Walsh–Hadamard. Elle s'ajoute au son sec, inchangé.",
    },
    controls: {
      "reverb/mix": {
        name: { en: "Room level", fr: "Niveau de la salle" },
        help: { en: "Level of the room added to the dry sound; 0 disables it.", fr: "Niveau de la salle ajoutée au son sec ; 0 la supprime." },
      },
      "reverb/decay_seconds": {
        name: { en: "Room decay", fr: "Décroissance de la salle" },
        unit: "s",
        help: { en: "Low-frequency decay time (T60) of the room.", fr: "Temps de décroissance (T60) de la salle dans le grave." },
      },
      "reverb/predelay_ms": {
        name: { en: "Predelay", fr: "Prédélai" },
        unit: "ms",
        help: { en: "Delay before the room answers.", fr: "Délai avant que la salle réponde." },
      },
      "reverb/damping_hz": {
        name: { en: "Room damping", fr: "Amortissement de la salle" },
        unit: "Hz",
        help: {
          en: "Cutoff of the low-pass in the feedback loop: lower values give darker tails.",
          fr: "Fréquence de coupure du passe-bas dans la boucle de retour : plus elle est basse, plus la queue est sombre.",
        },
      },
    },
  },
  {
    id: "action",
    title: { en: "Action and output", fr: "Mécanique et sortie" },
    intro: {
      en: "The noises of the action, the dampers of the played keys, the sustain pedal (also the space bar and MIDI CC64), and the output stage: a 20 Hz DC filter, the gain and a soft limiter.",
      fr: "Les bruits de la mécanique, les étouffoirs des touches jouées, la pédale forte (aussi la barre d'espace et le CC64 MIDI), et l'étage de sortie : un filtre continu à 20 Hz, le gain et un limiteur doux.",
    },
    controls: {
      "action/knock_gain": {
        name: { en: "Action noise", fr: "Bruit de mécanique" },
        help: {
          en: "Level of the keybed thump and the structural knock that come with each strike.",
          fr: "Niveau du choc du clavier et du coup dans la structure qui accompagnent chaque frappe.",
        },
      },
      "action/damper_scale": {
        name: { en: "Damper release", fr: "Retombée des étouffoirs" },
        help: {
          en: "Scales the time the dampers take to stop a released key: larger values make longer releases.",
          fr: "Multiplie le temps que mettent les étouffoirs à arrêter une touche relâchée : plus la valeur est grande, plus le relâchement est long.",
        },
      },
      "action/pedal": {
        name: { en: "Sustain pedal", fr: "Pédale forte" },
        help: {
          en: "0 up, 1 down. The dampers start to lift at 0.25 and are fully lifted at 0.65: half-pedalling is in between. It acts on the played keys and on the sympathetic register.",
          fr: "0 levée, 1 enfoncée. Les étouffoirs commencent à se lever à 0,25 et sont entièrement levés à 0,65 : la demi-pédale est entre les deux. Elle agit sur les touches jouées et sur la résonance sympathique.",
        },
      },
      "action/output_gain": {
        name: { en: "Output gain", fr: "Gain de sortie" },
        help: {
          en: "From the bridge force in newtons to the audio level, before the soft limiter (unchanged up to 0.8, a tanh knee toward 1 above).",
          fr: "Passage de la force au chevalet, en newtons, au niveau audio, avant le limiteur doux (sans effet jusqu'à 0,8, puis un coude en tanh vers 1).",
        },
      },
    },
  },
];

// Presets: kinds of piano, each a set of overrides of the defaults (every
// control not listed returns to its default; the pedal is left alone). They
// change the hammers, the strings, the voicing, the sympathetic register and
// the room: the soundboard's modes are fitted to the C++ grand and stay its own.
export const PRESETS = [
  {
    id: "concert",
    name: { en: "Concert grand", fr: "Grand piano de concert" },
    help: {
      en: "The voicing of coopiano's default.ini, the reference of every comparison with the C++ model: balanced felt, long sustain, three strings per key from F2 up, a medium room.",
      fr: "L'harmonisation du default.ini de coopiano, la référence de toutes les comparaisons avec le modèle C++ : feutre équilibré, longue tenue, trois cordes par touche à partir de fa 2, une salle moyenne.",
    },
    values: {},
  },
  {
    id: "bright",
    name: { en: "Bright modern grand", fr: "Grand piano moderne, brillant" },
    help: {
      en: "Hard, freshly voiced hammers for pop and rock: the shorter, narrower contact excites more high partials, a presence bell around 2.6 kHz and a lower treble loss keep the attack cutting through a mix; a drier room.",
      fr: "Des marteaux durs, fraîchement harmonisés, pour la pop et le rock : le contact plus court et plus étroit excite davantage de partiels aigus, une cloche de présence vers 2,6 kHz et moins de pertes dans l'aigu gardent une attaque qui perce ; une salle plus sèche.",
    },
    values: {
      "hammer/stiffness_scale": 1.7,
      "hammer/mass_scale": 1.1,
      "hammer/felt_width_scale": 1.0,
      "hammer/velocity_exponent": 1.5,
      "strings/partial_loss_scale": 0.8,
      "tone/lower_overtone_cut_db": 2,
      "tone/mid_gain_db": 2.5,
      "tone/mid_frequency_hz": 2600,
      "tone/mid_width_octaves": 1.1,
      "reverb/mix": 0.25,
      "reverb/decay_seconds": 0.9,
    },
  },
  {
    id: "jazz",
    name: { en: "Mellow jazz grand", fr: "Grand piano feutré, jazz" },
    help: {
      en: "Soft, well-played-in hammers: long, wide contacts round the attack and bring the fundamental forward, a dip around 1.8 kHz takes the edge off, the aftersound is a little stronger; a dry club room.",
      fr: "Des marteaux doux, bien joués : les contacts longs et larges arrondissent l'attaque et avancent le fondamental, un creux vers 1,8 kHz retire la dureté, la résonance qui suit est un peu plus forte ; une salle de club sèche.",
    },
    values: {
      "hammer/stiffness_scale": 0.55,
      "hammer/mass_scale": 1.5,
      "hammer/felt_width_scale": 1.8,
      "hammer/velocity_exponent": 2.0,
      "strings/partial_loss_scale": 1.4,
      "strings/horizontal_ratio": 0.5,
      "tone/fundamental_boost_db": 3,
      "tone/mid_gain_db": -4,
      "tone/mid_frequency_hz": 1800,
      "reverb/mix": 0.22,
      "reverb/decay_seconds": 0.9,
      "reverb/damping_hz": 4000,
    },
  },
  {
    id: "upright",
    name: { en: "Upright piano", fr: "Piano droit" },
    help: {
      en: "Shorter, stiffer strings: more inharmonicity, a shorter sustain and a stronger bridge coupling that drains the partials, fewer phantom partials; a boxy bump around 900 Hz, more action noise, a weaker sympathetic resonance and a small room. The soundboard modes stay the grand's.",
      fr: "Des cordes plus courtes et plus raides : plus d'inharmonicité, une tenue plus courte et un couplage au chevalet plus fort qui vide les partiels, moins de partiels fantômes ; une bosse « boîte » vers 900 Hz, plus de bruit de mécanique, une résonance sympathique plus faible et une petite pièce. Les modes de la table restent ceux du grand piano.",
    },
    values: {
      "hammer/stiffness_scale": 1.1,
      "hammer/mass_scale": 1.0,
      "strings/decay_scale": 0.65,
      "strings/treble_decay_scale": 0.3,
      "strings/inharmonicity_scale": 1.5,
      "strings/unison_detune_scale": 0.55,
      "strings/horizontal_ratio": 0.3,
      "strings/longitudinal_gain": 0.12,
      "strings/bridge_coupling": 1.5,
      "tone/fundamental_boost_db": -2,
      "tone/mid_gain_db": 2,
      "tone/mid_frequency_hz": 900,
      "tone/mid_width_octaves": 0.8,
      "resonance/gain": 0.12,
      "resonance/maximum_decay_seconds": 6,
      "reverb/mix": 0.15,
      "reverb/decay_seconds": 0.5,
      "reverb/predelay_ms": 4,
      "reverb/damping_hz": 6500,
      "action/knock_gain": 1.6,
    },
  },
  {
    id: "honkytonk",
    name: { en: "Honky-tonk", fr: "Honky-tonk" },
    help: {
      en: "A saloon upright left untuned: the strings of each key have drifted apart, so the unisons beat fast and wide, the honky-tonk chorus; hard hammers, a loud action, a shorter sustain and almost no room.",
      fr: "Un piano droit de saloon jamais accordé : les cordes de chaque touche se sont écartées, les unissons battent vite et large, le chorus « honky-tonk » ; des marteaux durs, une mécanique bruyante, une tenue plus courte et presque pas de salle.",
    },
    values: {
      "hammer/stiffness_scale": 1.5,
      "strings/decay_scale": 0.8,
      "strings/partial_loss_scale": 1.3,
      "strings/unison_detune_scale": 2.6,
      "strings/treble_unison_detune": 2.2,
      "strings/fast_decay_scale": 1.2,
      "tone/mid_gain_db": 3,
      "tone/mid_frequency_hz": 1500,
      "resonance/gain": 0.1,
      "reverb/mix": 0.12,
      "reverb/decay_seconds": 0.4,
      "reverb/predelay_ms": 2,
      "action/knock_gain": 1.8,
    },
  },
  {
    id: "felt",
    name: { en: "Felt piano (moderator)", fr: "Piano à feutre (modérateur)" },
    help: {
      en: "A felt strip between the hammers and the strings, the sound of intimate recordings: very soft, wide contacts filter out almost all upper partials, the action and the dampers come forward, resonance and room add a halo. The output gain is raised to make up for the softer strike.",
      fr: "Une bande de feutre entre marteaux et cordes, le son des enregistrements intimistes : des contacts très doux et très larges filtrent presque tous les partiels aigus, la mécanique et les étouffoirs passent au premier plan, la résonance et la salle ajoutent un halo. Le gain de sortie est relevé pour compenser la frappe plus douce.",
    },
    values: {
      "hammer/stiffness_scale": 0.3,
      "hammer/mass_scale": 1.8,
      "hammer/felt_width_scale": 2.0,
      "hammer/maximum_velocity_mps": 4,
      "hammer/velocity_exponent": 2.2,
      "strings/partial_loss_scale": 2.5,
      "tone/fundamental_boost_db": 4,
      "tone/mid_gain_db": -7,
      "tone/mid_frequency_hz": 1500,
      "tone/mid_width_octaves": 1.6,
      "resonance/gain": 0.3,
      "reverb/mix": 0.35,
      "reverb/decay_seconds": 1.6,
      "reverb/damping_hz": 3500,
      "action/knock_gain": 2.2,
      "action/damper_scale": 1.5,
      "action/output_gain": 0.0016,
    },
  },
  {
    id: "hall",
    name: { en: "Grand in a concert hall", fr: "Grand piano en salle de concert" },
    help: {
      en: "The concert grand in a large hall: a longer, darker reverberation with a later first answer, and a little more sympathetic resonance.",
      fr: "Le grand piano de concert dans une grande salle : une réverbération plus longue et plus sombre, une première réponse plus tardive, et un peu plus de résonance sympathique.",
    },
    values: {
      "resonance/gain": 0.22,
      "reverb/mix": 0.5,
      "reverb/decay_seconds": 2.8,
      "reverb/predelay_ms": 28,
      "reverb/damping_hz": 4500,
    },
  },
  {
    id: "vintage",
    name: { en: "Old, worn piano", fr: "Vieux piano fatigué" },
    help: {
      en: "Hammers hardened with age and grooved by the strings, dull strings slightly out of tune, a loose bridge that drains the sustain, a dark top end and slow dampers.",
      fr: "Des marteaux durcis par l'âge et creusés par les cordes, des cordes ternes légèrement désaccordées, un chevalet fatigué qui vide la tenue, un aigu sombre et des étouffoirs lents.",
    },
    values: {
      "hammer/stiffness_scale": 2.2,
      "hammer/felt_width_scale": 0.8,
      "strings/decay_scale": 0.75,
      "strings/treble_decay_scale": 0.25,
      "strings/partial_loss_scale": 2.0,
      "strings/inharmonicity_scale": 1.3,
      "strings/unison_detune_scale": 1.1,
      "strings/treble_unison_detune": 1.3,
      "strings/horizontal_ratio": 0.25,
      "strings/bridge_coupling": 1.8,
      "tone/mid_gain_db": -3,
      "tone/mid_frequency_hz": 3200,
      "reverb/mix": 0.2,
      "reverb/decay_seconds": 0.7,
      "action/knock_gain": 1.4,
      "action/damper_scale": 1.6,
    },
  },
];

// Controls the page drives itself: the keyboard sets them per voice.
export const VOICE_CONTROLS = ["freq", "gain", "gate"];

export const TEXT = {
  title: { en: "coopiano in the browser", fr: "coopiano dans le navigateur" },
  subtitle: {
    en: "A physically modelled piano: the Faust model of coopiano, compiled to WebAssembly by faust-rs.",
    fr: "Un piano à modélisation physique : le modèle Faust de coopiano, compilé en WebAssembly par faust-rs.",
  },
  start: { en: "Start audio", fr: "Démarrer l'audio" },
  stop: { en: "Stop audio", fr: "Arrêter l'audio" },
  loading: { en: "Loading…", fr: "Chargement…" },
  running: { en: "Running", fr: "En marche" },
  stopped: { en: "Stopped", fr: "Arrêté" },
  panic: { en: "All notes off", fr: "Tout arrêter" },
  reset: { en: "Defaults", fr: "Valeurs par défaut" },
  resetAll: { en: "Reset all controls", fr: "Tout remettre par défaut" },
  cpu: { en: "Audio thread load", fr: "Charge du thread audio" },
  voices: { en: "Sounding voices", fr: "Voix qui sonnent" },
  level: { en: "Output peak", fr: "Crête de sortie" },
  polyphony: { en: "Polyphony", fr: "Polyphonie" },
  bodyIdle: { en: "body idle", fr: "corps en veille" },
  body: { en: "Body", fr: "Corps" },
  bodyLight: { en: "Light (no imaging)", fr: "Léger (sans image stéréo)" },
  bodyFull: { en: "Imaged (4 bridge regions)", fr: "Imagé (4 régions du chevalet)" },
  velocity: { en: "Velocity (mouse and computer keys)", fr: "Vélocité (souris et clavier d'ordinateur)" },
  velocityByPosition: { en: "from the click position on the key", fr: "selon la position du clic sur la touche" },
  octave: { en: "Computer-keyboard octave", fr: "Octave du clavier d'ordinateur" },
  midi: { en: "MIDI input", fr: "Entrée MIDI" },
  midiAll: { en: "All inputs", fr: "Toutes les entrées" },
  midiNone: { en: "No MIDI input found", fr: "Aucune entrée MIDI trouvée" },
  midiUnsupported: {
    en: "This browser has no Web MIDI (use Chrome, Edge, Firefox or Opera).",
    fr: "Ce navigateur n'a pas Web MIDI (utiliser Chrome, Edge, Firefox ou Opera).",
  },
  midiDenied: { en: "MIDI access was refused.", fr: "L'accès MIDI a été refusé." },
  midiChannel: { en: "Channel", fr: "Canal" },
  midiOmni: { en: "omni", fr: "tous" },
  pedalButton: { en: "Pedal (space)", fr: "Pédale (espace)" },
  controls: { en: "Controls", fr: "Réglages" },
  presets: { en: "Presets", fr: "Préréglages" },
  presetsIntro: {
    en: "Kinds of piano, each a set of controls: a preset starts from the defaults and changes some of them, the pedal excepted. The other tabs then show what it set; a control changed afterwards marks the preset as modified.",
    fr: "Des types de piano, chacun un jeu de réglages : un préréglage part des valeurs par défaut et en change une partie, la pédale exceptée. Les autres onglets montrent alors ce qu'il a réglé ; un réglage modifié ensuite marque le préréglage comme modifié.",
  },
  apply: { en: "Apply", fr: "Appliquer" },
  modified: { en: "modified", fr: "modifié" },
  presetChanges: { en: "Sets", fr: "Règle" },
  presetNoChange: { en: "every control to its default", fr: "chaque réglage à sa valeur par défaut" },
  howTitle: { en: "How it works", fr: "Fonctionnement" },
  cpuWarning: {
    en: "The audio thread is overloaded: lower the polyphony, choose the light body or release the pedal.",
    fr: "Le thread audio est surchargé : baisser la polyphonie, choisir le corps léger ou relâcher la pédale.",
  },
};
