# File-based development hero

The homepage's animated explanation of file-based agent development.

The sequence makes the public project contract visible: describe an agent in
`agent.md`, add a skill and TypeScript tool, let Plico load the project and provide
the harness, then inspect an illustrative tool call and its result. The other
project files remain visible below the editor. Tool code is explicitly an excerpt.

The four beats share one visibility-aware, time-based animation loop. File flow
uses SVG paths measured from the actual elements. Visitors can inspect each file,
jump between beats, pause/resume in place, and replay from the beginning. The
walkthrough plays once and holds its completed result. Reduced motion shows complete static beats
and lets visitors step manually. Background tabs and offscreen scenes stop work.
At phone and tablet widths, switchable file and agent panes keep the scene compact
and text readable. Each story beat selects the relevant pane. Manual pane selection
pauses the animation. Buttons provide at least 44px of touch height at these widths.

The support conversation and ticket are illustrative. No provider is called, no
ticket is created, and the scene does not import the Plico runtime.

The editor reserves the full code layout while revealing text, with an inline caret
on the active line. `Icon.astro` supplies a shared SVG icon set for the controls,
files and actions; the icons do not depend on the active font.

Keep narrative data in `story.ts`, animation state in `controller.ts`, code typing
in `code-editor.ts`, and measured connections in `connections.ts`. Astro renders the markup and initial code so the
explanation remains readable before JavaScript loads.
