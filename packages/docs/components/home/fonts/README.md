# Geist Pixel

`geist-pixel-latin-400.woff2` is the Latin 400 file from `@fontsource/geist-pixel` 5.3.0 with its
overlapping contours merged (fontTools `removeOverlaps`, which needs `skia-pathops`):

```py
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps

font = TTFont("geist-pixel-latin-400-normal.woff2")
removeOverlaps(font)
font.flavor = "woff2"
font.save("geist-pixel-latin-400.woff2")
```

The stock glyphs draw every pixel as its own square, up to 168 contours a glyph, and Chromium took
about 1.5s (6s on a throttled phone) to shape the homepage's text in them. Merged, the glyphs fill
the same pixels with a handful of contours and the first layout takes under 100ms.

Geist Pixel is licensed under the SIL Open Font License 1.1; see `OFL.txt`.
