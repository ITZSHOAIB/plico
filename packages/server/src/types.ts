import type { ListenerOptions } from "./listener.js";

export interface ServePlicoOptions extends ListenerOptions {
  projectRoot: string;
  /**
   * Serve for inspection beside a host that owns the database: nothing is recovered or resumed,
   * and every request that would change state is refused with `inspection.read_only`.
   */
  inspect?: boolean;
  databasePath: string;
  host?: string;
  port?: number;
}
