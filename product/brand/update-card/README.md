# Plico update card

The image for every LinkedIn post after an epic or milestone ships. It is one fixed format so people
recognise Plico updates at a glance: 1080x1350 (4:5), rendered at 2x (2160x2700).
Styled after the fumadocs.dev homepage: framed canvas, star field, line art with halftone shading,
square boxes, one Verdigris accent.

## After each epic

1. Copy the latest file in `cards/` to `cards/NN-<slug>.json`, with `NN` one higher.
2. Fill in the fields below. Keep the `factory` visual unless the epic truly needs another one.
3. Render: `node render.mjs cards/NN-<slug>.json`. The image is `out/NN-<slug>.png`.
4. Look at the image: no clipped labels, no tag over the arm, text block centred.
5. Write the post text (see below) and commit the new card JSON. `out/` is not committed.

## Fixed in every card

- Frame: two rails, a top rule, a ruler above the status bar, pluses where lines meet.
- Top bar: the Plico mark on the left, `Update NN | vX.Y.Z` on the right. Numbers only go up.
- Star field on the right, kept clear of text and the visual.
- Status bar: a glowing dot with a status word, and tabs led by a filled `Plico` tab.
- Command box: `$ npm create plico@latest | plico.sohab.dev`.
- Dark background, Verdigris accent, Geist and Geist Mono. Headline at weight 500.
- The content block (visual, headline, line, command) sits on the vertical centre.

## Changes per card (the JSON file)

- `number`, and `version`: the published release the work shipped in. Post after the release is out.
- `headline`: up to about 5 words, two lines (`\n`). Wrap the payoff in `*stars*` for the accent colour.
- `line`: one sentence, under about 15 words.
- `status`: one word, usually `shipped`.
- `tabs`: two or three topic words after `Plico`.
- `visual`, one of:
  - `factory` (the default look): a robotic arm over a conveyor, in oblique line art with halftone
    shading. `input` labels the box on the belt, `output` the box in the gripper (keep each under about
    14 characters). Up to three `tags` sit over the first gate, the second gate and the store, in that
    order; `xy` (`[x, y]` in the 904x470 scene) moves one.
  - `orbit`: a dithered orb with up to three `tags` (`at`: the angle on the orbit in radians, 0 is
    right, about 1.6 is front, about 3.5 is left).
  - Tags take `icon` (braces, check or database) and `label`. Add new icons or visual types to
    `template.html` when a card needs one; keep the line-art and halftone style.

## Rules

- One idea per card. If it needs a second visual, it is two posts.
- No bullet lists or paragraphs on the image. Details go in the post text.
- A video only for milestone-sized launches; epics get this static card.

## Post text

Short, plain, no hype. In order:

1. One line with the outcome, matching the headline.
2. Two or three sentences: what you can do now and why it matters.
3. A tiny example if it fits in three lines (a config field, a command).
4. The link: the release or docs page, with "released in vX.Y.Z".
5. `npm create plico@latest` and two or three hashtags (#TypeScript #AIagents #opensource).

## Render

```sh
node render.mjs cards/01-typed-results.json   # writes out/01-typed-results.png
```

Uses headless Microsoft Edge; set `EDGE` to another Chromium binary if needed.
