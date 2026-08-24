export interface WakeLockSentinelLike extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}

export interface MediaSessionLike {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
  setPositionState?(state?: MediaPositionState): void;
}

export interface PlaybackPlatform {
  mediaSession: MediaSessionLike | null;
  requestScreenWakeLock: (() => Promise<WakeLockSentinelLike>) | null;
  createMetadata(): MediaMetadata | null;
}

interface PlaybackActions {
  play(): void;
  pause(): void;
  stop(): void;
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

export function createBrowserPlaybackPlatform(navigatorValue: Navigator = navigator): PlaybackPlatform {
  const wakeLock = (navigatorValue as Navigator & WakeLockNavigator).wakeLock;
  return {
    mediaSession: navigatorValue.mediaSession ?? null,
    requestScreenWakeLock: wakeLock === undefined ? null : () => wakeLock.request('screen'),
    createMetadata: () => typeof MediaMetadata !== 'function' ? null : new MediaMetadata({
      title: 'Current rack',
      artist: 'sequens-R',
      album: 'Local generative session',
      artwork: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    }),
  };
}

export class PlaybackSession {
  readonly #platform: PlaybackPlatform;
  readonly #actions: PlaybackActions;
  #wakeLock: WakeLockSentinelLike | null = null;
  #playing = false;

  constructor(platform: PlaybackPlatform, actions: PlaybackActions) {
    this.#platform = platform;
    this.#actions = actions;
  }

  initialize(): void {
    const session = this.#platform.mediaSession;
    if (session === null) return;
    session.metadata = this.#platform.createMetadata();
    this.#setActionHandler('play', () => this.#actions.play());
    this.#setActionHandler('pause', () => this.#actions.pause());
    this.#setActionHandler('stop', () => this.#actions.stop());
  }

  async setPlaying(playing: boolean, bpm: number, beat = 0): Promise<void> {
    this.#playing = playing;
    if (this.#platform.mediaSession !== null) this.#platform.mediaSession.playbackState = playing ? 'playing' : 'paused';
    this.updatePosition(bpm, beat);
    if (playing) await this.#acquireWakeLock();
    else await this.#releaseWakeLock();
  }

  updatePosition(bpm: number, beat: number): void {
    const setPositionState = this.#platform.mediaSession?.setPositionState;
    if (setPositionState === undefined || !Number.isFinite(bpm) || bpm <= 0) return;
    const secondsPerBeat = 60 / bpm;
    const duration = secondsPerBeat * 4;
    const position = Math.max(0, Math.min(duration - 0.001, ((beat % 4) + 4) % 4 * secondsPerBeat));
    try {
      setPositionState.call(this.#platform.mediaSession, { duration, playbackRate: 1, position });
    } catch {
      // Some Chromium versions expose Media Session without position state.
    }
  }

  async restoreAfterVisibility(): Promise<void> {
    if (this.#playing) await this.#acquireWakeLock();
  }

  async destroy(): Promise<void> {
    this.#playing = false;
    await this.#releaseWakeLock();
    for (const action of ['play', 'pause', 'stop'] as const) this.#setActionHandler(action, null);
  }

  #setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
    try {
      this.#platform.mediaSession?.setActionHandler(action, handler);
    } catch {
      // Action support differs by Chromium platform; transport controls remain in-app.
    }
  }

  async #acquireWakeLock(): Promise<void> {
    if (this.#platform.requestScreenWakeLock === null || this.#wakeLock?.released === false) return;
    try {
      const sentinel = await this.#platform.requestScreenWakeLock();
      this.#wakeLock = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.#wakeLock === sentinel) this.#wakeLock = null;
      }, { once: true });
    } catch {
      this.#wakeLock = null;
    }
  }

  async #releaseWakeLock(): Promise<void> {
    const sentinel = this.#wakeLock;
    this.#wakeLock = null;
    if (sentinel !== null && !sentinel.released) await sentinel.release().catch(() => undefined);
  }
}
