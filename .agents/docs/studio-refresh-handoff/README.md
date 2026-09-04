# Handoff: Sequens-R Studio Visual Refresh

## Overview

A full visual refresh of the Sequens-R studio UI. **The information architecture does not change** — every panel, control, and affordance keeps its place and its behaviour. What changes is the surface language: the app should read as a machined instrument panel rather than a stack of nested boxes.

The five moves that define the refresh:

1. **Plates, not boxes.** Module containers become milled panels: a subtle top-to-bottom gradient, a 1px inset white highlight along the top edge, a hairline ring instead of a border, and a soft downward drop shadow. Nested `border: 1px solid` boxes are removed throughout.
2. **Module identity moves to a spine.** Instead of tinting a module's whole background with its type colour, the colour appears as a 4px full-height bar on the plate's left edge, plus a small type chip (14%-alpha background, full-strength text).
3. **Lime is signal only.** `oklch(88% 0.21 118)` is reserved for *playing / armed / selected / active* states — playhead, active step pads, active slot, Play button, monitor-on, launched scene, accented notes. It is never decoration, never a heading colour, never a border.
4. **Recessed wells for grids.** Step grids, piano roll, slot rows, meters, and segmented controls sit in dark recessed wells: a near-black fill plus `inset 0 1px 3-4px rgba(0,0,0,.5-.65)`. Controls sit *in* the panel, not on it.
5. **Condensed silkscreen labels, mono numbers.** All labels are Barlow Condensed, uppercase, wide-tracked. Every number is JetBrains Mono with `font-variant-numeric: tabular-nums`.

## About the design files

The files in this bundle are **design references authored in HTML** — high-fidelity prototypes of the intended look, not production code to paste in. The target codebase is the existing **Svelte 5 + Vite + TypeScript** app in this repo. Recreate these designs using that app's existing components, stores, and conventions: keep the Svelte component boundaries, keep the state/store layer untouched, and re-author the markup and styles inside each component.

Note on technique: the reference files use inline styles because of how they were authored. **Do not port inline styles.** Translate every value into the repo's existing model — CSS custom properties in `src/styles/tokens.css`, shared primitives in `src/styles/base.css`, and component-scoped `<style>` blocks inside each `.svelte` file.

## Fidelity

**High-fidelity.** Colours, type, spacing, radii, and shadow recipes below are final and should be matched exactly. Where a surface is not shown in the reference (dialogs, toasts, context menus, settings, help overlays, the Drone field, CC/Mod modules, error and empty states), **extrapolate from the token set and the recipes in "Surface Recipes"** — do not invent new colours or a new shadow language. Ask before introducing any value not derivable from the tokens.

## Scope

**Re-skin plus markup restructuring is in scope.** Where the current DOM fights the new look — extra wrapper divs that existed only to carry borders, backgrounds that need to become spines, grids that need to become wells — restructure the markup. Two hard constraints:

- **Do not change application logic or state.** The stores, generators, audio graph, scheduler, MIDI, export, and project serialisation are out of scope. If a visual change appears to need a logic change, stop and flag it.
- **Do not break the test suite's selectors.** The Playwright specs in `tests/e2e/` query by role, accessible name, and `data-testid`. Preserve every `data-testid`, every `aria-label`, and every accessible name when moving elements. Run `npx playwright test` after each component and fix regressions before moving on.

## Design tokens

Replace the contents of `src/styles/tokens.css` with the set below. Old token names that map cleanly should keep their names so existing usages continue to resolve; the values change.

### Neutral ramp (hue 250, near-zero chroma)

| Token | Value | Use |
|---|---|---|
| `--n-900` | `oklch(9% 0.004 250)` | page backdrop outside the app frame |
| `--n-850` | `oklch(10% 0.005 250)` | deepest wells (piano roll, step grid) |
| `--n-825` | `oklch(11% 0.005 250)` | wells (slot rows, segmented tracks, status bar) |
| `--n-800` | `oklch(12% 0.005 250)` | velocity lane |
| `--n-780` | `oklch(13% 0.006 250)` | app shell / panel body; also **text on lime** |
| `--n-750` | `oklch(14% 0.006 250)` | inset chrome, drag handles, knob inner ring stroke |
| `--n-720` | `oklch(15% 0.006 250)` | panel content background, inline field fill |
| `--n-700` | `oklch(16% 0.006 250)` | disclosure rows, black piano keys |
| `--n-680` | `oklch(17% 0.007 250)` | plate gradient stop (bottom), header gradient stop |
| `--n-660` | `oklch(18% 0.007 250)` | plate gradient stop, LED off, list rows |
| `--n-640` | `oklch(20% 0.008 250)` | raised control fill (buttons, icon buttons), pad off |
| `--n-620` | `oklch(21% 0.008 250)` | plate gradient stop (top) |
| `--n-600` | `oklch(22% 0.008 250)` | secondary button fill; piano-roll bar grid line |
| `--n-560` | `oklch(24% 0.008 250)` | hairline rules, divider fills, primary-secondary button, pad-on-beat |
| `--n-540` | `oklch(25% 0.008 250)` | channel-strip ring |
| `--n-520` | `oklch(26% 0.008 250)` | plate ring, header underline, knob body |
| `--n-500` | `oklch(28% 0.008 250)` | top-chrome underline |
| `--n-460` | `oklch(30% 0.008 250)` | knob cap fill, unlit LED on a chip |
| `--n-300` | `oklch(42% 0.006 250)` | fader thumb gradient top |
| `--text-dim` | `oklch(52% 0.01 250)` | tertiary meta text, key labels |
| `--text-quiet` | `oklch(56% 0.01 250)` | field labels |
| `--text-muted` | `oklch(58% 0.01 250)` | section labels, silkscreen |
| `--text-2` | `oklch(60% 0.01 250)` | lane labels, inactive S/M |
| `--text-1` | `oklch(72% 0.01 250)` | icon default, disclosure labels |
| `--text-body` | `oklch(88% 0.006 250)` | body copy on controls |
| `--text` | `oklch(95% 0.004 250)` | primary text |
| `--text-hi` | `oklch(96% 0.004 250)` | inputs, knob pointer, values |

### Signal and status

| Token | Value | Use |
|---|---|---|
| `--signal` | `oklch(88% 0.21 118)` | **the only accent.** Playing, armed, selected, active |
| `--signal-glow` | `oklch(88% 0.21 118 / 28%)` | Play button outer glow |
| `--signal-wash` | `oklch(88% 0.21 118 / 12%)` | active-toggle background wash |
| `--signal-wash-strong` | `oklch(88% 0.21 118 / 16%)` | monitor-on / solo-on background |
| `--signal-2` | `oklch(70% 0.16 130)` | fader fill gradient bottom |
| `--danger` | `oklch(72% 0.16 30)` | stop, delete rack |
| `--meter-hot` | `oklch(70% 0.19 30)` | meter segments 10-11 |
| `--meter-warm` | `oklch(84% 0.16 85)` | meter segments 8-9 |
| `--meter-ok` | `oklch(80% 0.17 145)` | meter segments 0-7 |

### Module hues (spine + chip + library icon only)

| Module | Hue |
|---|---|
| Drums | `oklch(72% 0.16 45)` |
| Bass | `oklch(74% 0.14 160)` |
| Acid | `oklch(78% 0.15 100)` |
| Chords | `oklch(74% 0.15 320)` |
| Arp | `oklch(74% 0.13 250)` |
| Euclid | `oklch(76% 0.13 195)` |
| Piano roll | `oklch(74% 0.14 280)` |
| CC Control | `oklch(70% 0.03 250)` |
| Mod | `oklch(72% 0.12 15)` |
| Synth | `oklch(74% 0.14 265)` |
| Drone | `oklch(72% 0.02 250)` |

Chip background is always the hue at `/ 14%`; chip text is the hue at full strength; spine is the hue at full strength.

### Typography

Load from Google Fonts (or self-host into `public/` — preferred for an offline-capable app):
`Barlow Condensed` 400/500/600/700 and `JetBrains Mono` 400/500/700.

- `--font-label: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`
- `--font-data: "JetBrains Mono", ui-monospace, "SFMono-Regular", Consolas, monospace`
- Body: `--font-label`, `line-height: 1.35`, colour `--text`, background `--n-780`.

Type scale — every entry is used somewhere in the reference; match exactly.

| Role | Font | Size | Weight | Tracking | Case |
|---|---|---|---|---|---|
| Page H1 | Label | 3rem / 0.95 | 700 | -0.01em | as-authored |
| Panel H2 | Label | 1.5-1.6rem / 1 | 600 | — | as-authored |
| Module name (input) | Label | 1.35rem / 1.1 | 600 | 0.01em | as-authored |
| Module name (mobile) | Label | 1.25rem / 1 | 600 | — | as-authored |
| Channel / list name | Label | 1.15rem / 1 | 600 | — | as-authored |
| Button label | Label | 0.78-0.92rem / 1 | 600-700 | 0.08-0.1em | UPPER |
| Disclosure row | Label | 0.66-0.68rem / 1 | 600 | 0.16em | UPPER |
| Body copy | Label | 0.86-1.05rem | 400 | — | sentence |
| Section label | Data | 0.58-0.6rem / 1 | 500 | 0.14-0.16em | UPPER |
| Field label | Data | 0.55-0.58rem / 1 | 500 | 0.12-0.14em | UPPER |
| Value readout | Data | 0.78rem / 1 | 500 | — | tabular |
| Large value (BPM) | Data | 1.05rem / 1 | 700 | — | tabular |
| Stepper value | Data | 0.92rem / 1 | 500 | — | tabular |
| Meta / caption | Data | 0.6-0.66rem / 1 | 400 | 0.1-0.14em | UPPER |
| Meter scale | Data | 0.55rem / 1 | 400 | 0.12em | UPPER |

Any element displaying a number carries `font-variant-numeric: tabular-nums`.

### Radii

`4px` pads · `5px` slot/segment buttons, chips · `6px` small icon buttons, S/M · `7px` wells, inline fields, steppers · `8px` icon buttons 44px, list rows, wells, primary buttons · `9px` library cards, mobile chrome · `10px` module plates, dock buttons · `12px` floating panels · `14px` mobile dock.

### Shadow recipes

Name these as tokens; they are the core of the aesthetic.

```css
--elev-plate:
  inset 0 1px 0 oklch(100% 0 0 / 7%),
  0 0 0 1px oklch(26% 0.008 250),
  0 18px 34px -22px oklch(0% 0 0 / 90%);

--elev-panel:
  0 0 0 1px oklch(26% 0.008 250),
  0 30px 60px -30px oklch(0% 0 0 / 90%);

--elev-strip:
  inset 0 1px 0 oklch(100% 0 0 / 6%),
  0 0 0 1px oklch(25% 0.008 250);

--elev-chrome:
  inset 0 1px 0 oklch(100% 0 0 / 6%),
  0 1px 0 oklch(28% 0.008 250);

--well-sm: inset 0 1px 3px oklch(0% 0 0 / 55%);
--well-md: inset 0 1px 4px oklch(0% 0 0 / 60%);
--well-lg: inset 0 1px 4px oklch(0% 0 0 / 65%);
--well-meter: inset 0 1px 3px oklch(0% 0 0 / 70%);

--raise-btn: inset 0 1px 0 oklch(100% 0 0 / 7%);

--glow-signal: 0 0 18px oklch(88% 0.21 118 / 28%);
--glow-pad:    0 0 10px oklch(88% 0.21 118 / 45%),
               inset 0 0 0 1px oklch(96% 0.1 118);
--glow-playhead: 0 0 14px 2px oklch(88% 0.21 118 / 45%);
--glow-led:    0 0 8px oklch(88% 0.21 118 / 70%);
```

Plate gradient: `linear-gradient(180deg, oklch(21% 0.008 250), oklch(18% 0.007 250))`.
Chrome gradient: `linear-gradient(180deg, oklch(17% 0.007 250), oklch(14% 0.006 250))`.
Strip gradient: `linear-gradient(180deg, oklch(20% 0.008 250), oklch(17% 0.007 250))`.

### Spacing and sizing

Keep the existing `--space-*` scale. Layout gaps used: 20px between plates in the desktop rack, 14px between channel strips, 10-16px inside plates, 6-8px between sibling controls, 2-4px inside segmented groups.

Minimum hit target stays `--touch-target: 2.75rem` (44px). In the reference, top-chrome icon buttons and the Play button are 44px; in-plate icon buttons are 34px on desktop (pointer-only surface) and 34-38px on mobile inside a 44px-tall padded group. **Do not reduce any mobile target below 44px** — where a control reads as 34px, its parent group supplies the remaining padding.

## Surface recipes

Apply these as shared classes in `base.css`; they cover every surface including ones not drawn in the reference.

**Plate** — `border-radius: 10px`, plate gradient, `--elev-plate`, `overflow: hidden`, `position: relative`. First child is the spine: `position:absolute; inset: 0 auto 0 0; width: 4px; background: <hue>`. Content padding is asymmetric to clear the spine: `14px 14px 14px 18px`.

**Floating panel** (Mixer, Workspace, Module library) — `border-radius: 12px`, background `--n-780`, `--elev-panel`, `overflow: hidden`. Header 68px tall, chrome gradient, `--elev-chrome`. Body background `--n-720`, padding 16-18px.

**Chrome bar** (top chrome, panel headers) — chrome gradient + `--elev-chrome`. Desktop top chrome 76px; mobile 64px.

**Status strip** — 34px (30px mobile), background `--n-825`, `box-shadow: 0 1px 0 var(--n-560)`. Left: 7px lime dot with `--glow-led`. Right: mono meta, `--text-dim`.

**Well** — background `--n-825` (or `--n-850` for grids), `--well-sm`/`--well-md`, `padding: 3px` for pad groups and `8px` for grids, `border-radius: 7-8px`. Wells contain a gap-based grid; children get `border-radius` one step smaller.

**Raised button** — background `--n-640`, `--raise-btn`, no border, `border-radius: 8px`, label uppercase 600 Barlow Condensed tracked 0.08-0.1em. Secondary: background `--n-680`, colour `--text-dim`, no highlight. Primary/active: background `--signal`, colour `--n-780`, weight 700, `--glow-signal`.

**Icon button** — square, `border: 0`, `display: grid; place-items: center`. Inactive background `transparent`, colour `--text-1`. Resting-raised background `--n-640`. Active background `--signal-wash-strong`, colour `--signal`. Icons are 1.6-1.8 stroke width, `stroke-linecap/linejoin: round`, `currentColor`.

**Segmented control** — track is a well with `padding: 3px`, `gap: 2-3px`. Segments `border-radius: 5px`, height 32-34px. Selected: `--signal` on `--n-780`. Unselected: transparent on `--text-2`.

**Inline field / select** — height 34-40px, background `--n-720` (or `--n-750`), `--well-sm`, `border-radius: 6-7px`, `padding: 0 12px`. Layout: uppercase mono label, then value pushed right with `margin-inline-start: auto`, then a 13px chevron in `--text-muted`.

**Text input** — `border: 0`, background `transparent` when inline in a header (module name), or `--n-825` + `--well-sm` when a standalone field (project name, 44px tall).

**Section rule** — a flex row: uppercase mono label, then `<span style="flex:1;height:1px;background:var(--n-560)">`, then optional right-side meta or button. This replaces every horizontal border in the app.

**Disclosure row** — 40px tall, background `--n-700`, chevron-right 12px at 2.5 stroke, uppercase Barlow label tracked 0.16em, right-aligned mono state summary in `--text-dim`. Stacked rows use `display:grid; gap:1px; background: var(--n-560)` on the wrapper so the 1px gap *is* the divider.

**Knob** (`RotaryKnob.svelte`) — SVG `viewBox="0 0 64 64"`, drawn as:
1. Track arc `d="M 12.2 51.8 A 28 28 0 1 1 51.8 51.8"`, `pathLength="100"`, stroke `--n-560`, width 4-4.5, round caps.
2. Value arc, same path, stroke `--signal`, `stroke-dasharray="<pct> 100"`, `opacity: 0` when pct is 0.
3. Cap: `<circle cx=32 cy=30.5 r=19 fill="var(--n-460)">` — the 1.5px upward offset is what makes it read as machined; keep it.
4. Ring: `<circle cx=32 cy=32 r=19 fill=none stroke="var(--n-750)" stroke-width=1>`.
5. Pointer: `<line x1=32 y1=16-17 x2=32 y2=24-25 stroke="var(--text-hi)" stroke-width=2.5 linecap=round transform="rotate(<deg> 32 32)">`.

Rotation maps 0-100% to **-135deg to +135deg**: `deg = -135 + pct * 2.7`. Sizes: 66px in-plate, 62px master, 54px channel strip. The larger in-plate knob adds an outer `r=28` hairline circle in `--n-560`. Label above (uppercase mono, `--text-2`), value below or right (mono tabular, `--text-hi`).

**Fader** (mixer channel) — 40x168px track area. Groove: 8px wide, `--n-850`, `inset 0 1px 4px oklch(0% 0 0 / 75%)`, `border-radius: 4px`, full height. Fill: 8px wide from the bottom, height = level%, `linear-gradient(180deg, var(--signal), var(--signal-2))`, `0 0 10px oklch(88% 0.21 118 / 35%)`. Thumb: 38x20px, `linear-gradient(180deg, var(--n-300), oklch(26% 0.006 250))`, `0 3px 6px oklch(0% 0 0 / 60%), inset 0 1px 0 oklch(100% 0 0 / 18%)`, positioned `bottom: calc(<level>% - 10px)`. Cap line: 26x2px lime at 80% alpha, `bottom: calc(<level>% + 9px)`.

**LED meter** — 14px wide column, `--n-850` + `--well-meter`, `padding: 3px`, `gap: 2px`, 12 segments `flex: 1`, `border-radius: 1px`, min-height 6px. Segment index counted from the top (11 = hottest): 10-11 `--meter-hot`, 8-9 `--meter-warm`, 0-7 `--meter-ok`. Lit segments add `0 0 6px <zone colour>`; unlit are `--n-660`. `PK` label above, mono tabular peak value below.

**Step pad** — height 26px desktop lanes / 30px mobile / 32-38px slot buttons, `border-radius: 4-5px`. Off: `--n-640`, with every 4th step (beat) lifted to `--n-560`, plus `inset 0 1px 0 oklch(100% 0 0 / 5%)`. On: `--signal` + `--glow-pad`.

**Playhead** — 2px wide, full height, `--signal`, `--glow-playhead`, `pointer-events: none`, `left: calc(step / totalSteps * 100%)`.

**Piano roll** — 52px key gutter, 14px per semitone row, 48 rows visible in a 430px scroll viewport, 92px velocity lane pinned to the bottom. White keys `oklch(88% 0.004 250)` full width; black keys `--n-700` at 72% width, right-aligned. Keys in the current scale carry `inset 3px 0 0 <module hue>`; in-scale rows get a `<hue> / 6%` wash. Bar grid via `background-image: linear-gradient(to right, var(--n-600) 1px, transparent 1px); background-size: calc(100% / 16) 100%`. Notes: 12px tall, `border-radius: 2px`; unaccented fill `oklch(<44 + vel/127*26>% 0.09 <hue>)` with `inset 0 1px 0 oklch(100% 0 0 / 12%)`; accented fill `--signal` with `0 0 12px oklch(88% 0.21 118 / 40%)`. Velocity bars mirror note left/width, height = `vel/127*76%`, `border-radius: 2px 2px 0 0`.

**Module library card** — plate gradient, 3px spine in the module hue, `--elev-strip`, `border-radius: 9px`, `padding: 14px 14px 14px 16px`. Row: 20px icon stroked in the module hue, then the name at Barlow 600 1.15rem. Description below at 0.86rem `--text-2` with `text-wrap: pretty`.

**Mobile dock** — fixed `inset: auto 12px 12px`, `border-radius: 14px`, background `oklch(11% 0.005 250 / 92%)`, `backdrop-filter: blur(12px)`, `inset 0 -1px 0 var(--n-500), 0 18px 40px oklch(0% 0 0 / 65%)`, `padding: 5px`, `gap: 4px`. Grid `1.4fr 1fr 1fr 1fr` — Play is the wide first cell in `--signal`; the rest are 52px icon+label buttons on `--n-660`.

## Screens in the reference

All six live in `Studio Refresh.dc.html`, labelled 01-06.

1. **Desktop studio, 1440x900** — top chrome (76px) with brand lozenge, tempo/key group in a well, five 44px icon buttons, Add module, Stop, Play. Status strip (34px). Rack body: `padding: 20px 24px`, `grid-template-columns: repeat(3, minmax(0,1fr))`, `gap: 20px`, `align-items: start`. Three plates: Drums (8-lane grid with labels), Bass (single lane), Chords (single lane).
2. **Mixer, 1200px** — header with PAN/SENDS segmented toggle and close. Three channel strips in a 3-col grid, each with spine + name + S/M, then a PK meter beside an LVL fader, then a 3-knob row separated by `inset 0 1px 0 var(--n-520)`. Below: a full-width Rack master strip with OUT meter, delay-division select, and four 62px knobs.
3. **Workspace, 448x860** — sections separated by section rules: Project (name field + 6 icon-and-label tiles), Studio lanes, Scenes (numbered rows with Launch; the active scene's Launch is lime), Hardware MIDI, Music export, Diagnostics (2-col 1px-gap grid).
4. **Module library, 704px** — 3-col grid of 11 module cards.
5. **Piano roll, 940px** — a plate with the piano hue spine. Toolbar: melody select, zoom readout, a 4-button transform group in a well, an "Audition edits" checkbox in `--signal-wash`, and the hint line right-aligned.
6. **Mobile rack, 375x812** — 64px chrome with brand, project button, compact BPM/key group. 30px status strip. Expanded Drums plate (8x8 grid) and a collapsed Bass plate reduced to chip + name + slot + chevron. Floating dock.

## Component map

Each row is a repo file, what changes, and the recipes it needs.

| File | Change | Recipes |
|---|---|---|
| `src/styles/tokens.css` | **Replace values.** Do this first and land it alone. | all |
| `src/styles/base.css` | Add the shared surface classes; delete border-based rules | plate, panel, well, buttons, section rule |
| `src/styles/reset.css` | Add the font `@font-face`/link; set body bg/colour/line-height | typography |
| `src/App.svelte` | App shell background `--n-780`; rack grid gap 20px | — |
| `Transport.svelte` | Rebuild as chrome bar: gradient, tempo/key well, 44px icon buttons, lime Play with glow, danger Stop | chrome bar, well, buttons, icon button |
| `ModulePlate.svelte` | **Biggest restructure.** Background tint becomes spine + chip; nested boxes become section rules; disclosures become 1px-gap stacked rows | plate, section rule, disclosure, chip |
| `StepGrid.svelte` | Wrap in a well; pads get beat-lift and lime-on glow; playhead becomes a 2px glowing rule | well, step pad, playhead |
| `RotaryKnob.svelte` / `Knob.svelte` | Rebuild the SVG to the 5-layer machined recipe; -135/+135 mapping | knob |
| `MixerPanel.svelte` | Floating panel; channel strips as strips; faders and LED meters rebuilt | panel, strip, fader, LED meter, knob |
| `PianoRoll.svelte` | Recessed viewport, scale-aware keys and row wash, accent-lime notes, velocity lane | piano roll, playhead |
| `ScenePanel.svelte` | Section rule header + numbered rows; active Launch in lime | section rule, list row, button |
| `DiagnosticsPanel.svelte` | 2-col 1px-gap grid on `--n-560`; mono tabular values | grid divider, typography |
| `HardwarePanel.svelte` | Section rule + body copy + raised button | section rule, button |
| `SoundPanel.svelte` | Disclosure body: labelled controls in a 2-col grid | knob, inline field, stepper |
| `DesktopStudioPanel.svelte` | Workspace panel shell and section stack | panel, section rule |
| `Icon.svelte` | Confirm 1.6-1.8 stroke, round caps, `currentColor`; drop any fill-based icons | icon button |
| `CompositorPlayhead.svelte` | Lime 2px + glow | playhead |
| `DroneField.svelte` | **Not in the reference.** Extrapolate: plate + `--n-780` hue spine, well for the field | plate, well |

## Implementation order

Land each step as its own commit with tests passing.

1. `tokens.css` — values only. The app will look wrong-but-coherent; that is expected.
2. `reset.css` + fonts. Verify no layout shift from the condensed face; Barlow Condensed is narrower than Arial Narrow, so check for newly-wrapping or newly-loose labels.
3. `base.css` surface classes.
4. `RotaryKnob` — small, self-contained, high visual payoff, and it validates the shadow/gradient language.
5. `Transport` — proves the chrome recipe.
6. `ModulePlate` + `StepGrid` together — the spine restructure and the grid well are one visual idea.
7. `MixerPanel`.
8. `PianoRoll`.
9. The remaining panels.
10. Mobile pass: dock, compact chrome, collapsed plates, 44px audit.

## Interaction and state

No new state. Existing state drives the new visuals:

- **playing / armed** — lime fill, `--glow-pad` or `--glow-signal`.
- **selected slot** — lime fill on `--n-780` text plus `0 0 12px oklch(88% 0.21 118 / 40%)`.
- **monitor on / solo on** — `--signal-wash-strong` background, `--signal` icon or text.
- **muted** — no lime; icon drops to `--text-2`.
- **collapsed plate** — the whole plate becomes one 12px-padded row: chip, name, slot readout, chevron-right. Spine stays.
- **playhead position** — `left: calc(step / totalSteps * 100%)`.
- **meter level** — segment count from the existing peak value; zones as tabled.

Transitions: keep them short and mechanical. 120ms `ease-out` on background and colour for buttons and pads; **no transition on the playhead** (it is driven per-frame); no scale or bounce anywhere. Respect `prefers-reduced-motion` — the repo already has a reduced-motion playhead path (`tests/e2e` covers it); leave that behaviour intact.

Hover: raise the background one neutral step (e.g. `--n-640` to `--n-600`). Active: drop one step and add `--well-sm`, so the control depresses into the panel. Focus-visible: `outline: 2px solid var(--signal); outline-offset: 2px` — never remove it.

## Assets

No new images. Icons stay in `Icon.svelte` (Heroicons-style 24px outline paths, 1.6-1.8 stroke). `public/icon.svg` may want the lime updated to `oklch(88% 0.21 118)` for consistency.

## Files in this bundle

- `Studio Refresh.dc.html` — the refresh design, screens 01-06. **This is the spec.**
- `Studio Baseline.dc.html` — a faithful recreation of the current UI, built from the repo source. Use it as the before-picture when judging whether a change is a refresh or an accidental regression.
- `support.js` — runtime needed to open the two HTML files in a browser. Not part of the design.
- `screens/` — 2x PNG captures of all six screens, for reference without opening the HTML:
  - `01-desktop-studio.png` · `02-mixer.png` · `03-workspace.png` · `04-module-library.png` · `05-piano-roll.png` · `06-mobile-rack.png`

The PNGs are convenient, but **the HTML is the authority** — colours are authored in `oklch` and PNG capture flattens them to sRGB, so sample values from the token table or the HTML source, never with an eyedropper on a screenshot. The captures show the playhead at step 0; that is a tweak position, not a fixed design state.

Open either HTML file directly in a browser; no build step.

## Questions to raise rather than guess

- Any surface not in the reference that needs a colour outside the token set.
- Any case where the new look seems to require a logic or state change.
- Whether the fonts should be self-hosted (recommended for offline use) or loaded from Google Fonts.
- Any `data-testid` or accessible name that seems to need changing.
