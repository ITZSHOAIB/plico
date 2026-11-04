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

/** sm: inline with text and inside buttons. md: standalone (navigation, rows, icon buttons). */
const iconSizes = { sm: 14, md: 16 } as const;

export function Icon({
  name,
  size = "md",
  ...props
}: { name: IconName; size?: keyof typeof iconSizes } & Omit<LucideProps, "size">) {
  const Component = icons[name];
  return <Component aria-hidden="true" size={iconSizes[size]} strokeWidth={1.75} {...props} />;
}
