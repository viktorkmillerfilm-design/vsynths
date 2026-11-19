# vsynths

Fifteen browser synths in one page. `index.html` is a thin picker: a top bar with the instrument list (a dropdown on phones) and one full-size iframe that runs the selected instrument. Only one instrument plays at a time: on every switch the shell posts `{type:'vsynths:stop'}` to the running instrument and then loads the next one.

Each instrument is a single self-contained, offline HTML file (`<slug>/index.html`, Web Audio, no libraries, no network) with a panel modelled on the original's layout, touch knobs (drag up/down), an on-screen and computer keyboard (`a w s e d f t g y h u j k`, `z`/`x` octave), Web MIDI input, a sequencer, presets and `.mid` export. They work on iPhone in landscape (audio unlocks on the first tap).

Open `index.html#<slug>` to jump straight to one instrument; the last pick is remembered. Instruments whose folder is missing show a quiet "coming soon".

| slug | on-screen name | synthesis | built by |
|---|---|---|---|
| `fm7/` | fm-7 | 6-operator FM | vmorphs workers |
| `pd-cz/` | pd-1 | phase distortion | vmorphs workers |
| `wavemass/` | wavemass | wavetable | vmorphs workers |
| `fair-cmi/` | cmi-8 | 8-bit sampling workstation | vmorphs workers |
| `supersaw-8k/` | vs-8k | supersaw virtual analog | vmorphs workers |
| `obx-a/` | obx-a | 8-voice analog-style poly | vmorphs workers |
| `chip-2a03/` | pulsar 8 | 8-bit console APU chip (2 pulse, triangle, noise, DPCM), cycle-clocked | vmorphs workers |
| `chip-sid/` | trivox 64 | 3-voice 8-bit home-computer sound chip (6581 / 8580 filter flavours), cycle-clocked | vmorphs workers |
| `prism/` | prism | hybrid wavetable synth | vable |
| `minimoog/` | trident | 3-oscillator mono, ladder filter | vable |
| `moog-modular/` | patchwall | patchable modular | vable |
| `arp-soloist/` | tabula | 30-voice preset mono synth | vable |
| `juno-60/` | ember-6 | 6-voice DCO poly with arpeggio | vable |
| `juno-106/` | tide-6 | 6-voice DCO poly, 128 patches | vable |
| `alpha-juno/` | orbit-6 | 6-voice DCO poly, alpha dial | vable |
| `tb-303/` | acid line | bass line groovebox | vable |

Credits: the six instruments `minimoog/`, `moog-modular/`, `arp-soloist/`, `juno-60/`, `juno-106/`, `alpha-juno/` and the acid groovebox `tb-303/` were built by **vable** (the original groovebox lives at https://viktorkmillerfilm-design.github.io/vacid-acid-groovebox/). The other eight and the picker were built by vmorphs and its workers.

Names on the panels are our own; no manufacturer names or logos are used, and the "inspired by" notes describe the synthesis type only.

## Embedding an instrument

```html
<iframe src="chip-sid/index.html" allow="autoplay; midi; fullscreen"></iframe>
```

Every instrument stops all sound when it receives `window.postMessage({type:'vsynths:stop'}, '*')`.

## Tests

`tests/<slug>-test.js` run headless Chrome via puppeteer-core (no console errors, audible output below 0 dBFS with no NaN, valid MIDI file, iPhone landscape fit). `tests/picker-test.js` checks the shell and `tests/integration-test.js` serves the folder over http and switches through all 15 at desktop and iPhone-landscape size (iframe loads, no console errors, a key or tap makes sound, the stop message silences the old instrument). Folder slugs are historical file paths only; the visible names are our own.
