# Design QA · studio UI reorganization

source visual truth path: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/00-source-proposed.png`

implementation screenshot paths:

- desktop: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/06-desktop-final.png`
- mobile: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/08-mobile-final.png`

viewport and normalization:

- Source board: 1440 × 900 pixels at 1440 × 900 CSS px, device scale factor 1.
- Desktop implementation: 1440 × 900 pixels at 1440 × 900 CSS px, device scale factor 1.
- Mobile implementation: 375 × 667 pixels at 375 × 667 CSS px, device scale factor 1.
- Final combined desktop evidence: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/09-desktop-comparison-final.png`.
- Final combined mobile evidence: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/10-mobile-comparison-final.png`.

state: dark theme, restored local rack, stopped transport, workspace open on desktop and closed on mobile, first three module lanes visible, module action and advanced disclosures closed.

## Full-view comparison evidence

- Information architecture matches the target: performance controls are first, desktop utilities occupy a left rail, mobile utilities collapse to one row, and the rack begins above the mobile fold.
- Desktop uses three parallel lanes at the target viewport. The implementation is intentionally denser than the concept because it retains the complete slot, mutation, drum-lane, routing, and persistence behavior.
- Mobile retains root and scale next to tempo rather than reducing the key to one compact token; this is an intentional functional deviation that still fits without horizontal overflow.

## Focused region comparison evidence

- Module header: immediate reorder/monitor/solo/mute/collapse controls and one compact `⋯` actions disclosure match the target hierarchy; Help, duplicate, MIDI export, and delete remain text-labelled inside it.
- Control field: rotary controls, steppers, segmented values, switches, selects, and desktop mixer faders are visually distinct while preserving native semantics.
- Drum grid: visible lane names improve scanning without reducing the scrollable step target or changing pattern behavior.
- No raster imagery, logos, illustrations, or product-photo assets exist in either the app or target, so image-quality fidelity is not applicable. Existing text/glyph utility marks are retained; no replacement image assets were required.

## Required fidelity surfaces

- Fonts and typography: the implementation preserves the product’s condensed label stack and monospace data text, with a smaller desktop brand and compact uppercase metadata. The source board’s surrounding serif audit copy is not part of the app target.
- Spacing and layout rhythm: command height, rail width, three-lane grid, module header density, and 44 px targets match the target intent without clipping or page-level horizontal overflow.
- Colors and visual tokens: existing canvas/surface/structure/text/playing/danger tokens are preserved; lime remains limited to playing and selected musical states.
- Image quality and asset fidelity: not applicable; the product uses no target imagery.
- Copy and content: Workspace, Output & advanced, accessible module action labels, module labels, and lane names are concise and standalone. Frequent-action emoticons retain explicit accessible names; existing status, help, and export copy is preserved where consequence or ambiguity calls for visible text.

## Comparison history

### Iteration 1 · blocked

- [P2] Desktop rendered two module lanes while the selected target showed three at 1440 px.
- [P2] Native number spinners consumed narrow stepper input width and clipped two-digit values.
- [P2] Mobile Workspace used a reactive `open={desktopSurface}` attribute, allowing rack updates to close a user-open disclosure and hide the next control in a workflow.

Fixes made:

- Switched the 90rem desktop breakpoint to three module lanes and two parameter columns per lane.
- Removed native number-spinner chrome inside stepper inputs and reserved the center value width.
- Bound Workspace to explicit `workspaceOpen` state initialized from the desktop media query and preserved across application updates.

Post-fix evidence:

- Desktop three-lane/value fix: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/06-desktop-final.png`.
- Desktop combined comparison: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/09-desktop-comparison-final.png`.
- Mobile disclosure result: `/Users/jasubal/.codex/visualizations/2026/08/24/01a03398-7145-7633-ba81-cc6a8803de2e/sequens-r-ui-implementation/08-mobile-final.png` plus the passing disclosure-based Playwright flows.

### Iteration 2 · passed

No actionable P0, P1, or P2 mismatch remains. Residual differences are acceptable product constraints: the implementation carries full production controls, keeps root/scale visible, and uses one mobile Workspace disclosure instead of three concept-only utility shortcuts.

Primary interactions tested: Play/Pause/Resume/Stop, frozen paused playheads, keyboard-accessible parameter change in automated Chrome, Workspace persistence, module actions menu, module MIDI export, Output & advanced routing, add/delete module, scenes, save/import/export/share, accessible icon names, and responsive mobile/desktop transitions.

Console errors checked: page-error assertions pass in the critical and desktop module Chrome flows; the complete automated suite is required before handoff.

final result: passed
