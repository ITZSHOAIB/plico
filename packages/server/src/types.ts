import type { ListenerOptions } from "./listener.js";

export interface ServePlicoOptions extends ListenerOptions {
  projectRoot: string;
  databasePath: string;
  host?: string;
  port?: number;
}
