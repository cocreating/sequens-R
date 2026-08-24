interface SchedulerLike {
  postTask?(callback: () => unknown | Promise<unknown>, options?: { priority?: 'background' | 'user-visible' | 'user-blocking' }): Promise<unknown>;
}

interface TaskWindow extends Window {
  scheduler?: SchedulerLike;
}

/** Schedules non-urgent work without adding a runtime polyfill or network dependency. */
export function postBackgroundTask<T>(callback: () => T | Promise<T>, windowValue: TaskWindow = window): Promise<T> {
  const postTask = windowValue.scheduler?.postTask;
  if (postTask !== undefined) return postTask.call(windowValue.scheduler, callback, { priority: 'background' }) as Promise<T>;
  return new Promise<T>((resolve, reject) => {
    windowValue.setTimeout(() => { Promise.resolve(callback()).then(resolve, reject); }, 0);
  });
}
