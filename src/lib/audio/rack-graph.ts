import { presetById, type RackMixState, type SoundState } from './sound';

export interface MeterReading {
  peakDbfs: number;
  rmsDbfs: number;
}

const MIN_DB = -120;
const PARAM_RAMP_SECONDS = 0.02;
const DELAY_DIVISION_BEATS = [1, 0.5, 0.75, 1 / 3, 0.25, 0.375] as const;

function gainForPercent(value: number): number {
  return (Math.max(0, Math.min(100, value)) / 100) ** 2;
}

function gainForDb(value: number): number {
  return 10 ** (value / 20);
}

function toDb(value: number): number {
  return value <= 0 ? MIN_DB : Math.max(MIN_DB, 20 * Math.log10(value));
}

function holdAndRamp(param: AudioParam, value: number, time: number, duration = PARAM_RAMP_SECONDS): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
  param.linearRampToValueAtTime(value, time + duration);
}

export function delaySecondsFor(bpm: number, division: number): number {
  const normalizedBpm = Math.max(20, Math.min(300, bpm));
  const beats = DELAY_DIVISION_BEATS[Math.max(0, Math.min(DELAY_DIVISION_BEATS.length - 1, Math.round(division)))]!;
  return 60 / normalizedBpm * beats;
}

export function createSoftClipCurve(character: number, length = 2_048): Float32Array<ArrayBuffer> {
  const amount = Math.max(0, Math.min(100, character)) / 100;
  const drive = 1 + amount * 5;
  const normalization = Math.tanh(drive);
  const curve = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
  for (let index = 0; index < length; index += 1) {
    const input = index / (length - 1) * 2 - 1;
    const saturated = Math.tanh(input * drive) / normalization;
    const blend = amount * 0.65;
    curve[index] = amount === 0 ? input : (input * (1 - blend) + saturated * blend) / (1 + amount * 0.5);
  }
  return curve;
}

function createProceduralImpulse(context: BaseAudioContext): AudioBuffer {
  const durationSeconds = 1.35;
  const length = Math.ceil(context.sampleRate * durationSeconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
    const channel = impulse.getChannelData(channelIndex);
    let state = (0x7f4a7c15 ^ Math.imul(channelIndex + 1, 0x9e3779b9)) >>> 0;
    for (let index = 0; index < length; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      const noise = state / 0xffff_ffff * 2 - 1;
      const time = index / context.sampleRate;
      const envelope = Math.exp(-time * 4.4) * (1 - Math.exp(-time * 180));
      const diffusion = channelIndex === 0 ? 1 : index % 2 === 0 ? 0.91 : -0.91;
      channel[index] = noise * envelope * diffusion * 0.42;
    }
  }
  return impulse;
}

class MeterTap {
  readonly node: AnalyserNode;
  readonly #samples: Float32Array<ArrayBuffer>;

  constructor(context: BaseAudioContext) {
    this.node = new AnalyserNode(context, { fftSize: 256, smoothingTimeConstant: 0.65 });
    this.#samples = new Float32Array(this.node.fftSize);
  }

  read(): MeterReading {
    this.node.getFloatTimeDomainData(this.#samples);
    let peak = 0;
    let power = 0;
    for (const sample of this.#samples) {
      peak = Math.max(peak, Math.abs(sample));
      power += sample * sample;
    }
    return { peakDbfs: toDb(peak), rmsDbfs: toDb(Math.sqrt(power / this.#samples.length)) };
  }
}

export class RackModuleStrip {
  readonly input: GainNode;
  readonly #level: GainNode;
  readonly #pan: StereoPannerNode;
  readonly #delaySend: GainNode;
  readonly #reverbSend: GainNode;
  readonly #meter: MeterTap;

  constructor(
    context: BaseAudioContext,
    dryBus: AudioNode,
    delayBus: AudioNode,
    reverbBus: AudioNode,
    sound: Readonly<SoundState>,
    level: number,
  ) {
    this.input = new GainNode(context, { gain: gainForDb(presetById(sound.presetId).outputTrimDb) });
    this.#level = new GainNode(context, { gain: level });
    this.#pan = new StereoPannerNode(context, { pan: sound.pan / 100 });
    this.#delaySend = new GainNode(context, { gain: gainForPercent(sound.delaySend) });
    this.#reverbSend = new GainNode(context, { gain: gainForPercent(sound.reverbSend) });
    this.#meter = new MeterTap(context);
    this.input.connect(this.#level).connect(this.#pan).connect(this.#meter.node);
    this.#meter.node.connect(dryBus);
    this.#meter.node.connect(this.#delaySend).connect(delayBus);
    this.#meter.node.connect(this.#reverbSend).connect(reverbBus);
  }

  applyLevel(level: number, time: number): void {
    holdAndRamp(this.#level.gain, Math.max(0, Math.min(1, level)), time, 0.012);
  }

  applySound(sound: Readonly<SoundState>, time: number): void {
    holdAndRamp(this.input.gain, gainForDb(presetById(sound.presetId).outputTrimDb), time);
    holdAndRamp(this.#pan.pan, sound.pan / 100, time);
    holdAndRamp(this.#delaySend.gain, gainForPercent(sound.delaySend), time);
    holdAndRamp(this.#reverbSend.gain, gainForPercent(sound.reverbSend), time);
  }

  cancelAndFade(value: number, time: number, endTime: number): void {
    if (typeof this.#level.gain.cancelAndHoldAtTime === 'function') this.#level.gain.cancelAndHoldAtTime(time);
    else {
      this.#level.gain.cancelScheduledValues(time);
      this.#level.gain.setValueAtTime(this.#level.gain.value, time);
    }
    this.#level.gain.linearRampToValueAtTime(value, endTime);
  }

  readMeter(): MeterReading {
    return this.#meter.read();
  }

  disconnect(): void {
    this.input.disconnect();
    this.#level.disconnect();
    this.#pan.disconnect();
    this.#meter.node.disconnect();
    this.#delaySend.disconnect();
    this.#reverbSend.disconnect();
  }
}

export class RackAudioGraph {
  readonly #context: BaseAudioContext;
  readonly #dryBus: GainNode;
  readonly #delayBus: GainNode;
  readonly #reverbBus: GainNode;
  readonly #delayLeft: DelayNode;
  readonly #delayRight: DelayNode;
  readonly #delayFeedbackLeft: GainNode;
  readonly #delayFeedbackRight: GainNode;
  readonly #delayReturn: GainNode;
  readonly #delayPanLeft: StereoPannerNode;
  readonly #delayPanRight: StereoPannerNode;
  readonly #reverbReturn: GainNode;
  readonly #convolver: ConvolverNode;
  readonly #headroom: GainNode;
  readonly #dcBlocker: BiquadFilterNode;
  readonly #correctiveEq: BiquadFilterNode;
  readonly #softClip: WaveShaperNode;
  readonly #limiter: DynamicsCompressorNode;
  readonly #meter: MeterTap;
  readonly #output: GainNode;
  #mix: Readonly<RackMixState>;
  #bpm: number;

  constructor(context: BaseAudioContext, destination: AudioNode, bpm: number, mix: Readonly<RackMixState>) {
    this.#context = context;
    this.#mix = { ...mix };
    this.#bpm = bpm;
    this.#dryBus = new GainNode(context, { gain: 1 });
    this.#delayBus = new GainNode(context, { gain: 1 });
    this.#reverbBus = new GainNode(context, { gain: 1 });
    this.#delayLeft = new DelayNode(context, { maxDelayTime: 5, delayTime: delaySecondsFor(bpm, mix.delayDivision) });
    this.#delayRight = new DelayNode(context, { maxDelayTime: 5, delayTime: delaySecondsFor(bpm, mix.delayDivision) * 1.5 });
    this.#delayFeedbackLeft = new GainNode(context, { gain: mix.delayFeedback / 100 });
    this.#delayFeedbackRight = new GainNode(context, { gain: mix.delayFeedback / 100 });
    this.#delayReturn = new GainNode(context, { gain: mix.delayReturn / 100 });
    this.#reverbReturn = new GainNode(context, { gain: mix.reverbReturn / 100 });
    this.#headroom = new GainNode(context, { gain: 0.5 });
    this.#dcBlocker = new BiquadFilterNode(context, { type: 'highpass', frequency: 18, Q: 0.707 });
    this.#correctiveEq = new BiquadFilterNode(context, { type: 'peaking', frequency: 280, Q: 0.75, gain: -0.75 });
    this.#softClip = new WaveShaperNode(context, { curve: createSoftClipCurve(mix.masterCharacter), oversample: 'none' });
    this.#limiter = new DynamicsCompressorNode(context, { threshold: -1, knee: 1, ratio: 20, attack: 0.003, release: 0.09 });
    this.#meter = new MeterTap(context);
    this.#output = new GainNode(context, { gain: gainForDb(-1.5) });

    this.#delayPanLeft = new StereoPannerNode(context, { pan: -0.72 });
    this.#delayPanRight = new StereoPannerNode(context, { pan: 0.72 });
    this.#delayBus.connect(this.#delayLeft).connect(this.#delayPanLeft).connect(this.#delayReturn);
    this.#delayBus.connect(this.#delayRight).connect(this.#delayPanRight).connect(this.#delayReturn);
    this.#delayLeft.connect(this.#delayFeedbackLeft).connect(this.#delayRight);
    this.#delayRight.connect(this.#delayFeedbackRight).connect(this.#delayLeft);

    this.#convolver = new ConvolverNode(context, { buffer: createProceduralImpulse(context) });
    this.#convolver.normalize = true;
    this.#reverbBus.connect(this.#convolver).connect(this.#reverbReturn);

    this.#dryBus.connect(this.#headroom);
    this.#delayReturn.connect(this.#headroom);
    this.#reverbReturn.connect(this.#headroom);
    this.#headroom
      .connect(this.#dcBlocker)
      .connect(this.#correctiveEq)
      .connect(this.#softClip)
      .connect(this.#limiter)
      .connect(this.#meter.node)
      .connect(this.#output)
      .connect(destination);
  }

  createModuleStrip(sound: Readonly<SoundState>, level: number): RackModuleStrip {
    return new RackModuleStrip(this.#context, this.#dryBus, this.#delayBus, this.#reverbBus, sound, level);
  }

  applyMix(mix: Readonly<RackMixState>, bpm: number, time: number): void {
    this.#mix = { ...mix };
    this.#bpm = bpm;
    const delayTime = delaySecondsFor(bpm, mix.delayDivision);
    holdAndRamp(this.#delayLeft.delayTime, delayTime, time, 0.03);
    holdAndRamp(this.#delayRight.delayTime, delayTime * 1.5, time, 0.03);
    holdAndRamp(this.#delayFeedbackLeft.gain, mix.delayFeedback / 100, time);
    holdAndRamp(this.#delayFeedbackRight.gain, mix.delayFeedback / 100, time);
    holdAndRamp(this.#delayReturn.gain, mix.delayReturn / 100, time);
    holdAndRamp(this.#reverbReturn.gain, mix.reverbReturn / 100, time);
    this.#softClip.curve = createSoftClipCurve(mix.masterCharacter);
  }

  fadeOut(startTime: number, endTime: number): void {
    this.#output.gain.setValueAtTime(gainForDb(-1.5), startTime);
    this.#output.gain.linearRampToValueAtTime(0, endTime);
  }

  readMasterMeter(): MeterReading {
    return this.#meter.read();
  }

  get delayTailSeconds(): number {
    const delayTime = delaySecondsFor(this.#bpm, this.#mix.delayDivision) * 1.5;
    const feedback = this.#mix.delayFeedback / 100;
    if (this.#mix.delayReturn === 0 || feedback === 0) return Math.min(2, delayTime);
    return Math.min(2, delayTime * Math.max(1, Math.ceil(Math.log(0.001) / Math.log(Math.max(0.001, feedback)))));
  }

  dispose(): void {
    for (const node of [
      this.#dryBus, this.#delayBus, this.#reverbBus, this.#delayLeft, this.#delayRight,
      this.#delayFeedbackLeft, this.#delayFeedbackRight, this.#delayPanLeft, this.#delayPanRight,
      this.#delayReturn, this.#convolver, this.#reverbReturn,
      this.#headroom, this.#dcBlocker, this.#correctiveEq, this.#softClip, this.#limiter,
      this.#meter.node, this.#output,
    ]) node.disconnect();
  }
}
