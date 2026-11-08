import { createContext, useContext, useEffect, useState } from "react";

/** True when the server was started with `plico serve --inspect`: Studio may read but not act. */
export const InspectionContext = createContext(false);

export const inspectionReason =
  "Studio is inspecting runs that another process owns, so it does not start, cancel or approve anything.";

export function useInspecting(): boolean {
  return useContext(InspectionContext);
}

export function useInspectionMode(): boolean {
  const [inspecting, setInspecting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { inspection?: boolean } | null) => {
        if (!cancelled) setInspecting(body?.inspection === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return inspecting;
}
