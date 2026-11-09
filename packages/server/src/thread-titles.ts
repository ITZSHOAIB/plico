import { loadProject } from "@plico/core";
import {
  createThreadTitler,
  type EventStore,
  type ModelProvider,
  type ThreadStore,
  type ThreadTitler,
} from "@plico/runtime";

/**
 * After a run in a thread completes, asks the project's titler for a title and stores it. The
 * keyword title is already stored, so a titler that fails or never answers changes nothing.
 */
export function withThreadTitles(deps: {
  projectRoot: string;
  eventStore: EventStore;
  threadStore?: ThreadStore | undefined;
  provider?: ModelProvider | undefined;
}): EventStore {
  const { threadStore } = deps;
  if (!threadStore) return deps.eventStore;
  let titler: Promise<ThreadTitler | undefined> | undefined;
  const resolve = (): Promise<ThreadTitler | undefined> => {
    titler ??= loadProject(deps.projectRoot).then((project) =>
      createThreadTitler(deps.projectRoot, project.config, deps.provider),
    );
    return titler;
  };

  async function name(runId: string): Promise<void> {
    const threadId = await threadStore?.getThreadForRun(runId);
    if (!threadStore || !threadId) return;
    // Ask the store first so a user-titled or finished thread never pays for a title.
    const request = await threadStore.getTitleRequest(threadId);
    const write = request && (await resolve());
    if (!request || !write) return;
    const title = await write(request.messages);
    if (title) await threadStore.setGeneratedTitle(threadId, title, request.revision);
  }

  return {
    ...deps.eventStore,
    async appendEvent(event) {
      await deps.eventStore.appendEvent(event);
      if (event.type === "run.completed" && event.payload.output !== undefined)
        void name(event.runId).catch(() => {});
    },
  };
}
