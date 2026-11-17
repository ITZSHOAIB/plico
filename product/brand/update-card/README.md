# Plico update card kit

Reusable format for LinkedIn posts after an epic or milestone: 1080x1350 (4:5),
rendered at 2x (2160x2700). Keep only reusable assets in this directory:
`template.html`, `render.mjs`, `card.example.json`, these instructions and `.gitignore`.
Post-specific cards, illustrations, copy, renders and browser profiles belong under
`artifacts/marketing/<update>/`.

## Workflow

1. Copy `card.example.json` to `artifacts/marketing/<update>/card.json`.
2. Set the next update number from the latest published post, and the release
   version containing the work. Use `preview` until that release is published.
3. Write a new illustration explaining the feature. Reuse the format, not the
   previous post's graphic. Save it as `illustration.svg` beside the card and set
   `visual` to `{ "type": "svg", "file": "illustration.svg" }`.
4. Render from the repository root:

   ```sh
   node product/brand/update-card/render.mjs artifacts/marketing/<update>/card.json
   ```

   Output is `<update>/out/card.png`, with its HTML and browser profile alongside.
   An optional second argument chooses another output directory outside this kit.
5. Inspect the image for clipped labels, overlaps and alignment. Keep text clear
   of the illustration. Save the post copy beside the card. Publish after release.

## Fixed format

- Framed canvas: two rails, top rule, ruler above the status bar, pluses at joins.
- Top bar: Plico mark, `Update NN | vX.Y.Z`. Update numbers only go up.
- Sparse star field, kept clear of text and the illustration.
- Dark background `#0a0b0b`, Verdigris accent `#62bfa8`, Geist and Geist Mono.
- Headline at weight 500. Content sits on the vertical centre.
- Status bar: glowing dot, status word, filled Plico tab, two or three topic tabs.
- Command: `$ npm create plico@latest | plico.sohab.dev`.

## Card fields

- `number`: update number; variants of the same post share a number.
- `version`: published release version, without the `v` prefix.
- `headline`: about five words on two lines (`\n`); `*stars*` mark accented words.
- `line`: one sentence, under about 15 words.
- `status`: `preview` while drafting, `shipped` once published.
- `tabs`: two or three topic words after Plico.
- `visual`: a post-specific SVG (`type: svg`, `file` relative to the card).

Custom SVGs use a `904x470` viewBox. Match the cream line art, halftone shading
and single Verdigris accent. The template also includes `factory` and `orbit` as
reusable visual examples, not mandatory illustrations. Factory accepts `input`,
`output`, and up to three tags (`icon`, `label`, optional `xy`). Orbit tags use
`at` for their orbital angle. Icons are `braces`, `check`, and `database`.

## Post copy

Keep it short, concrete and developer-focused. A few relevant emojis are fine.

1. Outcome first, matching the image headline, with the release version.
2. Two or three sentences explaining what developers can do and why it matters.
3. A tiny example if it fits in three lines.
4. A release or docs link, with "released in vX.Y.Z" only after publication.
5. `npm create plico@latest` and two or three hashtags.

One idea per card. Keep bullet lists and paragraphs in the post, off the image.
Use static cards for epics; reserve video for milestone launches.

Rendering uses headless Microsoft Edge; set `EDGE` to another Chromium binary.
