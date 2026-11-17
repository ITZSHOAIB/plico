/**
 * Runs tasks in order, at most `concurrency` at once. A task starts only while `canStart` holds;
 * tasks that never started are undefined in the result.
 */
export async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  canStart: () => boolean,
): Promise<Array<T | undefined>> {
  const results: Array<T | undefined> = new Array(tasks.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length && canStart()) {
      const index = next++;
      const task = tasks[index];
      if (task) results[index] = await task();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return results;
}
