import type { ChordEvent, MusicalKey, NoteEvent, Pattern } from '../core/pattern';
import { SCALE_INTERVALS } from '../core/theory/scales';

export const PIANO_PITCH_MIN = 36;
export const PIANO_PITCH_MAX = 83;
export const PIANO_ACCENT_VELOCITY = 112;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function activePianoEvents(pattern: Pattern): readonly NoteEvent[] {
  return pattern.events.filter((event) => event.startStep >= 0 && event.startStep < pattern.lengthSteps);
}

export function hiddenPianoEventCount(pattern: Pattern): number {
  return pattern.events.length - activePianoEvents(pattern).length;
}

export function setPianoEventVelocity(event: NoteEvent, velocity: number): NoteEvent {
  const normalized = clamp(Math.round(velocity), 1, 127);
  return { ...event, velocity: normalized, ...(event.accent && normalized < PIANO_ACCENT_VELOCITY ? { accent: false } : {}) };
}

export function setPianoEventAccent(event: NoteEvent, accent: boolean): NoteEvent {
  if (!accent) return { ...event, accent: false };
  return { ...event, accent: true, velocity: Math.max(PIANO_ACCENT_VELOCITY, event.velocity) };
}

function scalePitches(key: MusicalKey): number[] {
  const intervals = SCALE_INTERVALS[key.scale];
  return Array.from({ length: 128 }, (_, pitch) => pitch).filter((pitch) => {
    const pitchClass = ((pitch - key.root) % 12 + 12) % 12;
    return intervals.includes(pitchClass);
  });
}

export function transposePitchByScaleDegree(pitch: number, direction: -1 | 1, key: MusicalKey): number {
  const pitches = scalePitches(key);
  const candidate = direction > 0
    ? pitches.find((value) => value > pitch)
    : [...pitches].reverse().find((value) => value < pitch);
  return clamp(candidate ?? pitch, PIANO_PITCH_MIN, PIANO_PITCH_MAX);
}

export function transposePatternByScaleDegree(pattern: Pattern, direction: -1 | 1, key: MusicalKey): Pattern {
  return {
    ...pattern,
    events: pattern.events.map((event) => event.startStep < pattern.lengthSteps
      ? { ...event, pitch: transposePitchByScaleDegree(event.pitch, direction, key) }
      : event),
  };
}

export function transposePatternByOctave(pattern: Pattern, direction: -1 | 1): Pattern {
  return {
    ...pattern,
    events: pattern.events.map((event) => event.startStep < pattern.lengthSteps
      ? { ...event, pitch: clamp(event.pitch + direction * 12, PIANO_PITCH_MIN, PIANO_PITCH_MAX) }
      : event),
  };
}

export function chordAtStep(chords: readonly ChordEvent[], step: number): ChordEvent | null {
  if (chords.length === 0) return null;
  const cycleSteps = Math.max(...chords.map((chord) => chord.startStep + chord.durationSteps));
  const normalizedStep = cycleSteps > 0 ? ((step % cycleSteps) + cycleSteps) % cycleSteps : 0;
  return [...chords]
    .sort((left, right) => right.startStep - left.startStep)
    .find((chord) => normalizedStep >= chord.startStep && normalizedStep < chord.startStep + chord.durationSteps)
    ?? chords[0]!;
}

export function stampChord(pattern: Pattern, chord: ChordEvent, startStep: number, fallbackVelocity = 96): Pattern {
  const normalizedStart = clamp(Math.floor(startStep), 0, pattern.lengthSteps - 1);
  const durationSteps = Math.max(0.25, Math.min(chord.durationSteps, pattern.lengthSteps - normalizedStart));
  const additions = [...new Set(chord.pitches)]
    .filter((pitch) => pitch >= PIANO_PITCH_MIN && pitch <= PIANO_PITCH_MAX)
    .filter((pitch) => !pattern.events.some((event) => event.startStep === normalizedStart && event.pitch === pitch))
    .map((pitch): NoteEvent => ({ startStep: normalizedStart, durationSteps, pitch, velocity: fallbackVelocity }));
  return {
    ...pattern,
    events: [...pattern.events, ...additions].sort((left, right) => left.startStep - right.startStep || left.pitch - right.pitch),
  };
}
