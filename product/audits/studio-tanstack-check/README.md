# Studio data and routing check

This Windows/Node check compares the last slice of #74 with a small isolated
TanStack prototype. It does not change the Studio implementation or API.

The prototype uses React Query 5.105.3 and React Router 1.170.46 with React
19.1.0. Three browser-level tests passed: open `?run=a`, show a failed
workspace request, and keep run B's workspace visible after run A's request
finishes late. The Studio tests `RunUrl.test.tsx` and
`WorkspaceReliability.test.tsx` pass the corresponding scenarios through the
actual application. Both approaches can satisfy these cases.

The current app needs one shareable run parameter and already handles the
live event stream, reconnects, replay position, and request generations. The
prototype did not integrate these behaviors or measure implementation size,
bundle size, or maintenance over time. The check therefore shows neither a
failure of TanStack nor a demonstrated benefit from migrating this slice.
Retain the current implementation and reconsider the libraries when Studio
needs richer routing or shared server-state caching. This does not change ADR
0009's proposed status for the libraries.

To rerun on Windows with Node and pnpm, copy the three `.txt` files into an
empty temporary directory, removing each `.txt` suffix, then run:

```powershell
pnpm install --frozen-lockfile
pnpm exec vitest run comparison.test.js
```

The saved prototype pins the Windows Rolldown binding used in this check; it
is not intended as a cross-platform package or production implementation.
