import { useCallback, useState } from "react";
import { type NavItem, NavRail } from "./components/NavRail";
import { RunList } from "./components/RunList";
import { useEvals } from "./hooks/useEvals";
import { useProjectData } from "./hooks/useProjectData";
import { useRunInspector } from "./hooks/useRunInspector";
import { useRunUrl } from "./hooks/useRunUrl";
import { ThemeToggle } from "./theme/ThemeToggle";
import { Notice } from "./ui/Page";
import type { View } from "./view";
import { MainView } from "./views/MainView";

export function App() {
  const data = useProjectData();
  const { loadRuns, loadReadiness } = data;
  const onEvalsFinished = useCallback(
    async () => void (await Promise.all([loadRuns(), loadReadiness()])),
    [loadRuns, loadReadiness],
  );
  const evals = useEvals(onEvalsFinished);
  const inspector = useRunInspector();
  const { selectRun: inspectRun, clear } = inspector;
  const { select: selectEval, setError: setEvalError } = evals;
  const [view, setView] = useState<View>("overview");
  const onSelect = useCallback(() => {
    setView("runs");
    selectEval(null);
  }, [selectEval]);
  const { selectRun, openRun, openError, clearRunUrl } = useRunUrl(
    inspectRun,
    onSelect,
    loadRuns,
    setEvalError,
  );

  const showTopLevelView = (next: View) => {
    clearRunUrl();
    setView(next);
    clear();
  };

  const navItems: NavItem[] = [
    {
      view: "overview",
      label: "Overview",
      icon: "overview",
      onSelect: () => showTopLevelView("overview"),
    },
    {
      view: "runs",
      label: "Runs",
      icon: "runs",
      count: data.runs.length,
      onSelect: () => showTopLevelView("runs"),
    },
    {
      view: "instructions",
      label: "Instructions",
      icon: "instructions",
      onSelect: () => showTopLevelView("instructions"),
    },
    {
      view: "artifacts",
      label: "Artifacts",
      icon: "artifacts",
      disabled: !inspector.selectedRun,
      onSelect: () => {
        if (!inspector.selectedRun) return;
        setView("artifacts");
        void inspector.loadWorkspace(inspector.selectedRun.runId);
      },
    },
    {
      view: "evals",
      label: "Evals",
      icon: "evals",
      onSelect: () => {
        clearRunUrl();
        setView("evals");
        evals.select(null);
        evals.setError(null);
        void evals.refresh();
        void loadRuns();
      },
    },
    {
      view: "readiness",
      label: "Readiness",
      icon: "readiness",
      alert: (data.readiness?.summary.error ?? 0) > 0,
      onSelect: () => {
        clearRunUrl();
        setView("readiness");
        void loadReadiness();
      },
    },
  ];

  // On small screens the run list is its own screen; the run detail replaces it once one is open.
  const runListOnMobile = view === "runs" && !inspector.selectedRun;

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2 lg:hidden">
        <span className="truncate font-semibold">
          {data.project?.config.name ?? "Plico Studio"}
        </span>
        <ThemeToggle />
      </header>
      <NavRail items={navItems} view={view} />
      <RunList
        runs={data.runs}
        selectedRun={inspector.selectedRun}
        onSelectRun={selectRun}
        visibleOnMobile={runListOnMobile}
      />
      <main
        className={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${runListOnMobile ? "hidden" : "flex"}`}
      >
        {data.runsError && <Notice>{data.runsError}</Notice>}
        {openError && view !== "evals" ? <Notice>{openError}</Notice> : null}
        <MainView
          view={view}
          data={data}
          inspector={inspector}
          evals={evals}
          onOpenRun={openRun}
          onBackToRuns={() => showTopLevelView("runs")}
        />
      </main>
    </div>
  );
}
