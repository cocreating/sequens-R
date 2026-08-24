export async function runViewTransition(update: () => void | Promise<void>, documentValue: Document = document): Promise<void> {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || documentValue.startViewTransition === undefined) {
    await update();
    return;
  }
  const transition = documentValue.startViewTransition(update);
  await transition.finished.catch(() => undefined);
}
