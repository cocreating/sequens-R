import { deserializeRack, fromBase64Url, serializeRack, toBase64Url } from './codec';
import type { ShareableRack } from './types';

export async function rackToFragment(rack: ShareableRack): Promise<string> {
  return `#p=${toBase64Url(await serializeRack(rack))}`;
}

export async function loadRackFromFragment(fragment: string): Promise<ShareableRack | null> {
  if (fragment === '' || fragment === '#') return null;
  if (!fragment.startsWith('#p=')) return null;
  const payload = fragment.slice(3);
  if (payload === '') throw new TypeError('Patch fragment is empty.');
  return deserializeRack(fromBase64Url(payload));
}
