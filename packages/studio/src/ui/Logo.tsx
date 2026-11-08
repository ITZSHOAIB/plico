/** The Plico mark: a page with a folded corner (plico, "I fold"), in the brand accent. */
export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        d="M5 2h13l8 8v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z"
        className="fill-accent"
      />
      <path d="M18 2v5.5a2.5 2.5 0 0 0 2.5 2.5H26z" className="fill-on-accent" opacity="0.3" />
      <text
        x="12.5"
        y="20.5"
        textAnchor="middle"
        fontSize="13"
        fontWeight="800"
        className="fill-on-accent font-mono"
      >
        P
      </text>
    </svg>
  );
}
