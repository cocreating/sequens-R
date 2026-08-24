import { describe, expect, it, vi } from 'vitest';
import {
  captureProjectScene,
  createProject,
  deleteProjectScene,
  migrateProject,
  renameProjectScene,
} from '../../src/lib/project/model';
import { PlaybackSession, type MediaSessionLike, type WakeLockSentinelLike } from '../../src/lib/platform/playback-session';
import { postBackgroundTask } from '../../src/lib/platform/tasks';
import { STARTER_RACK } from '../../src/lib/share/starter';
import { applyScene, createRackState, setModuleSlot } from '../../src/lib/state/rack';

describe('Phase 5 scenes', () => {
  it('captures, renames, applies, and deletes module slot assignments', () => {
    const rack = createRackState(STARTER_RACK);
    rack.modules = rack.modules.map((module, index) => setModuleSlot(module, index + 1));
    let project = captureProjectScene(createProject(rack), rack, 'Verse');
    const scene = project.scenes[0]!;
    expect(scene.assignments).toEqual(Object.fromEntries(rack.modules.map((module) => [module.id, module.activeSlot])));

    const changed = { ...rack, modules: rack.modules.map((module) => setModuleSlot(module, 7)) };
    expect(applyScene(changed, scene).modules.map((module) => module.activeSlot)).toEqual([1, 2, 3]);
    project = renameProjectScene(project, scene.id, 'Drop');
    expect(project.scenes[0]?.name).toBe('Drop');
    expect(deleteProjectScene(project, scene.id).scenes).toEqual([]);
  });

  it('migrates version 2 documents with no scenes and validates version 3 assignments', () => {
    const current = createProject(createRackState(STARTER_RACK));
    const migrated = migrateProject({ ...current, schemaVersion: 2, scenes: undefined });
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.scenes).toEqual([]);
    expect(() => migrateProject({
      ...current,
      scenes: [{ id: 'scene', name: 'Broken', assignments: { module: 8 } }],
    })).toThrow(/0 to 7/u);
  });
});

describe('Phase 5 platform fallbacks', () => {
  it('uses scheduler.postTask when available and setTimeout otherwise', async () => {
    const postTask = vi.fn(async (callback: () => unknown) => callback());
    const scheduled = await postBackgroundTask(() => 42, { scheduler: { postTask } } as unknown as Window);
    expect(scheduled).toBe(42);
    expect(postTask).toHaveBeenCalledWith(expect.any(Function), { priority: 'background' });

    const setTimeout = vi.fn((callback: TimerHandler) => { (callback as () => void)(); return 1; });
    const fallback = await postBackgroundTask(() => 'fallback', { setTimeout } as unknown as Window);
    expect(fallback).toBe('fallback');
    expect(setTimeout).toHaveBeenCalledOnce();
  });

  it('connects media controls, position state, and screen wake lock lifecycle', async () => {
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const positions: MediaPositionState[] = [];
    const mediaSession: MediaSessionLike = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: (action, handler) => handlers.set(action, handler),
      setPositionState: (position) => { if (position !== undefined) positions.push(position); },
    };
    class Sentinel extends EventTarget implements WakeLockSentinelLike {
      released = false;
      async release(): Promise<void> { this.released = true; this.dispatchEvent(new Event('release')); }
    }
    const sentinel = new Sentinel();
    const requestWakeLock = vi.fn(async () => sentinel);
    const actions = { play: vi.fn(), pause: vi.fn(), stop: vi.fn() };
    const session = new PlaybackSession({
      mediaSession,
      requestScreenWakeLock: requestWakeLock,
      createMetadata: () => ({ title: 'sequens-R' }) as MediaMetadata,
    }, actions);

    session.initialize();
    handlers.get('play')?.({ action: 'play' } as MediaSessionActionDetails);
    expect(actions.play).toHaveBeenCalledOnce();
    await session.setPlaying(true, 120, 2);
    expect(mediaSession.playbackState).toBe('playing');
    expect(requestWakeLock).toHaveBeenCalledOnce();
    expect(positions.at(-1)).toMatchObject({ duration: 2, position: 1, playbackRate: 1 });
    await session.setPlaying(false, 120);
    expect(sentinel.released).toBe(true);
    await session.destroy();
    expect(handlers.get('play')).toBeNull();
  });
});
