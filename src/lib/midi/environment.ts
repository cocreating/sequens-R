import type { MidiAccessLike, MidiEnvironment, MidiPermissionState } from './types';

interface MidiNavigator {
  requestMIDIAccess?: (options?: { sysex?: boolean; software?: boolean }) => Promise<MidiAccessLike>;
}

export function midiSupported(navigatorValue: Navigator = navigator): boolean {
  return typeof (navigatorValue as unknown as MidiNavigator).requestMIDIAccess === 'function';
}

export function createBrowserMidiEnvironment(navigatorValue: Navigator = navigator): MidiEnvironment {
  return {
    async requestAccess(): Promise<MidiAccessLike> {
      const request = (navigatorValue as unknown as MidiNavigator).requestMIDIAccess;
      if (request === undefined) throw new Error('Web MIDI is not available in this browser.');
      return request.call(navigatorValue, { sysex: false, software: false });
    },
    async queryPermission(): Promise<MidiPermissionState> {
      if (!midiSupported(navigatorValue)) return 'unsupported';
      if (navigatorValue.permissions?.query === undefined) return 'unknown';
      try {
        const status = await navigatorValue.permissions.query({ name: 'midi' as PermissionName });
        return status.state;
      } catch {
        return 'unknown';
      }
    },
    now: () => performance.now(),
  };
}
