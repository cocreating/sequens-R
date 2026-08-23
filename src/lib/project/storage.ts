import { migrateProject, type ProjectDocument } from './model';

const DATABASE_NAME = 'sequens-r';
const STORE_NAME = 'projects';
const CURRENT_PROJECT_KEY = 'current';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

export async function loadCurrentProject(): Promise<ProjectDocument | null> {
  const database = await openDatabase();
  try {
    const value = await requestResult(database.transaction(STORE_NAME).objectStore(STORE_NAME).get(CURRENT_PROJECT_KEY));
    return value === undefined ? null : migrateProject(value);
  } finally {
    database.close();
  }
}

export async function saveCurrentProject(project: ProjectDocument): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    await requestResult(transaction.objectStore(STORE_NAME).put(migrateProject(project), CURRENT_PROJECT_KEY));
    await completed;
  } finally {
    database.close();
  }
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (navigator.storage?.persist === undefined) return null;
  return navigator.storage.persist();
}
