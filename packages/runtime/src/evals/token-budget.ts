import type { ModelProvider } from "../types/index.js";

export interface TokenBudget {
  /** True once a model call was refused; no further run should start. */
  readonly exhausted: boolean;
  /** Wraps a provider so each model call asks the budget first. `onRefused` marks the run as cut off. */
  meter(provider: ModelProvider, onRefused: () => void): ModelProvider;
}

/**
 * A suite-wide token cap for live runs. A call's usage is only known when it finishes, so a call
 * starts only when the tokens spent plus the calls in flight, each estimated at the average call so
 * far, stay within the cap. Until one call has finished, calls go one at a time.
 */
export function createTokenBudget(cap: number): TokenBudget {
  let spent = 0;
  let calls = 0;
  let inFlight = 0;
  let exhausted = false;
  let waiting: Array<() => void> = [];

  const acquire = async (): Promise<boolean> => {
    for (;;) {
      if (exhausted || spent >= cap) break;
      const projected =
        calls === 0
          ? inFlight === 0
            ? spent
            : Number.POSITIVE_INFINITY
          : spent + (inFlight + 1) * (spent / calls);
      if (projected <= cap) {
        inFlight++;
        return true;
      }
      if (inFlight === 0) break;
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    exhausted = true;
    return false;
  };

  const release = (tokens: number | undefined) => {
    inFlight--;
    if (tokens !== undefined) {
      spent += tokens;
      calls++;
    }
    const wake = waiting;
    waiting = [];
    for (const resolve of wake) resolve();
  };

  return {
    get exhausted() {
      return exhausted;
    },
    meter(provider, onRefused) {
      return {
        ...provider,
        async *stream(request, options) {
          if (!(await acquire())) {
            onRefused();
            throw new Error(`Token cap of ${cap} reached.`);
          }
          let tokens: number | undefined;
          try {
            for await (const chunk of provider.stream(request, options)) {
              if (chunk.type === "finish")
                tokens = chunk.usage.inputTokens + chunk.usage.outputTokens;
              yield chunk;
            }
          } finally {
            release(tokens);
          }
        },
      };
    },
  };
}
