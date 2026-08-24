import type { Generator, MusicalContext, ParamSchema, Pattern } from '../core/pattern';
import { sfc32 } from '../core/rng';
import { mutationSeed, sortedPattern } from './shared';

export interface DrumsParams {
  steps: number;
  groove: number;
  swing: number;
  humanize: number;
  overrideLanes: number;
  lane0: number;
  lane1: number;
  lane2: number;
  lane3: number;
  lane4: number;
  lane5: number;
  lane6: number;
  lane7: number;
}

const LANE_KEYS = ['lane0', 'lane1', 'lane2', 'lane3', 'lane4', 'lane5', 'lane6', 'lane7'] as const;

const GROOVES: readonly (readonly string[])[] = [
  ['x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..x...x...x...x.', '............x...', '....x...........', '..............x.', '...x.......x....'],
  ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '...x...x...x...x.', '............x...', '..x.......x.....', '......x.......x.', '...........x....'],
  ['x.....x...x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..x...x...x...x.', '..............x.', '.....x..........', '.........x......', '...x.........x..'],
  ['x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '...x.......x....', '..........x.....', '..x.........x...', '......x.........', '..............x.'],
  ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..x...x...x...x.', '......x.........', '..........x.....', '...x.........x..', '..............x.'],
  ['x.....x.....x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '...x...x...x...x.', '........x.......', '..x.........x...', '......x.......x.', '..........x.....'],
] as const;

export const drumsParamSchema: ParamSchema = [
  { key: 'steps', defaultValue: 16, min: 16, max: 32, step: 16, label: 'Steps', options: ['16', '32'], control: 'segmented' },
  { key: 'groove', defaultValue: 0, min: 0, max: 5, step: 1, label: 'Style', options: ['Four', 'Broken', 'Latin', 'Electro', 'Half-time', 'Odd'] },
  { key: 'swing', defaultValue: 0, min: 0, max: 75, step: 1, label: 'Swing', unit: '%', control: 'knob' },
  { key: 'humanize', defaultValue: 0, min: 0, max: 40, step: 1, label: 'Humanize', unit: '%', control: 'knob' },
  { key: 'overrideLanes', defaultValue: 0, min: 0, max: 255, step: 1, label: 'Override lanes', control: 'hidden' },
  ...LANE_KEYS.map((key, lane) => ({ key, defaultValue: 0, min: 0, max: 0xffffffff, step: 1, label: `Lane ${lane + 1}`, control: 'hidden' as const })),
];

export const drumsGenerator: Generator<DrumsParams> = {
  id: 'drums',
  defaults: { steps: 16, groove: 0, swing: 0, humanize: 0, overrideLanes: 0, lane0: 0, lane1: 0, lane2: 0, lane3: 0, lane4: 0, lane5: 0, lane6: 0, lane7: 0 },
  paramSchema: drumsParamSchema,
  generate(seed, params) {
    const random = sfc32(seed);
    const groove = GROOVES[params.groove] ?? GROOVES[0]!;
    const events = [];
    for (let step = 0; step < params.steps; step += 1) {
      for (let lane = 0; lane < groove.length; lane += 1) {
        const sequence = groove[lane]!;
        const laneOverridden = (params.overrideLanes & 1 << lane) !== 0;
        const laneMask = params[LANE_KEYS[lane]!] >>> 0;
        const active = laneOverridden ? (laneMask >>> step & 1) === 1 : sequence[step % 16] === 'x';
        const variation = !laneOverridden && step >= 16 && random() < 0.08 + params.humanize / 1000;
        if (!active && !variation) continue;
        const swingOffset = step % 2 === 1 ? params.swing / 200 : 0;
        const velocityOffset = Math.round((random() - 0.5) * params.humanize);
        events.push({
          startStep: step + swingOffset,
          durationSteps: 0.5,
          pitch: 36 + lane,
          velocity: Math.max(1, Math.min(127, 104 - lane * 3 + velocityOffset)),
          lane,
        });
      }
    }
    return sortedPattern(params.steps, events);
  },
  mutate(_base, seed, intensity, params, context) {
    return this.generate(mutationSeed(seed, intensity), params, context);
  },
};
