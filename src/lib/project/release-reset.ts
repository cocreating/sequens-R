const RELEASE_MARKER_KEY = 'sequens-r:library-release';
const RELEASE_MARKER_VALUE = 'phase-7-v2';
const RETIRED_DATABASE_NAME = 'sequens-r';

function deleteRetiredDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(RETIRED_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('The retired project database could not be cleared.'));
    request.onblocked = () => reject(new Error('The retired project database is still open in another tab.'));
  });
}

async function clearOriginCaches(): Promise<void> {
  if (!('caches' in globalThis)) return;
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

export async function preparePhase7LibraryRelease(): Promise<boolean> {
  if (localStorage.getItem(RELEASE_MARKER_KEY) === RELEASE_MARKER_VALUE) return false;
  await Promise.all([deleteRetiredDatabase(), clearOriginCaches()]);
  localStorage.setItem(RELEASE_MARKER_KEY, RELEASE_MARKER_VALUE);
  return true;
}
