import {
  Activity,
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CircleCheck,
  CircleX,
  File,
  FileText,
  FlaskConical,
  LayoutDashboard,
  type LucideIcon,
  type LucideProps,
  Moon,
  Package,
  RefreshCw,
  ShieldCheck,
  Sun,
  TriangleAlert,
} from "lucide-react";

// The single place icons are chosen. Swapping the icon set means editing this map only.
const icons = {
  overview: LayoutDashboard,
  runs: Activity,
  instructions: FileText,
  artifacts: Package,
  evals: FlaskConical,
  readiness: ShieldCheck,
  back: ArrowLeft,
  previous: ChevronLeft,
  next: ChevronRight,
  latest: ChevronsRight,
  refresh: RefreshCw,
  file: File,
  snapshot: Camera,
  sun: Sun,
  moon: Moon,
  ok: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 16, ...props }: { name: IconName } & LucideProps) {
  const Component = icons[name];
  return <Component aria-hidden="true" size={size} strokeWidth={1.75} {...props} />;
}
