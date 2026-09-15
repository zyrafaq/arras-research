# Arras.io Theme Format Analysis

## How Theme Codes Work

Theme codes are base64-encoded binary data. The "arras/" prefix is NOT a
namespace — it's the natural base64 encoding of the v1 magic bytes:

```
Magic bytes: 6a ba da b3 f0
Base64:      arras/...
```

So `arras/ABBUxpZ...` is ONE base64 string, not "arras/" + data.

## v1 Binary Format (current, 82 bytes for standard theme)

```
Offset  Size   Field
──────  ────   ─────
 0      5      Magic: 6a ba da b3 f0
 5      1      Version: 01
 6      1      Name length (N)
 7      N      Name (UTF-8)
7+N     1      Author length (M)
8+N     M      Author (UTF-8)
9+N+M   1      Table length (usually 20)
10+N+M  60     Color table: 20 × (R,G,B) — 3 bytes per color
70+N+M  1      Special table length (usually 1)
71+N+M  3      Special table: 1 × (R,G,B)
74+N+M  1      Blend byte: 0–255 → 0.0–1.0
75+N+M  1      Neon: 0 or 1
```

Total = 76 + N + M bytes.

## v0 Binary Format (legacy)

```
name\0author\0blend_byte(RGB × palette_size)
```

No magic bytes. Detected by absence of v1 magic.

## Color Palette Order (20 colors, indices 0–19)

This order is what the binary format uses. It does NOT match the JSON dict
key order (which groups semantic categories differently).

```
Index  Name       Semantic Use
─────  ────       ────────────
  0    teal       Shield Bars, Legendary Polygons
  1    lgreen     Health Bars, Shiny Polygons
  2    orange     Triangles
  3    yellow     Neutral Team
  4    aqua       Hexagons
  5    pink       Crashers
  6    vlgrey     Eggs
  7    lgrey      Maze Walls
  8    guiwhite   Text (pure white)
  9    black      Borders
 10    blue       Blue Team
 11    green      Green Team
 12    red        Red Team
 13    gold       Squares
 14    purple     Pentagons
 15    magenta    Purple Team
 16    grey       Barrels, Bar Backgrounds
 17    dgrey      Rogue Team
 18    white      Arena Background
 19    guiblack   Grid (pure black)
```

Extra indices (not in binary palette, JSON-only):
  25    mustard    Yellow Team
  26    tangerine  Orange Team
  27    brown      Brown Team
  28    cyan       Cyan Team

## JSON Dict Format (arras.io API / settings)

```json
{
  "name": "Theme Name",
  "author": "Author",
  "content": {
    "teal": "#7ad3db",
    "lgreen": "#b9e87e",
    ...
    "guiblack": "#000000"
  },
  "paletteSize": 20,
  "border": 0.65
}
```

Key difference: JSON uses named color keys with "#rrggbb" hex strings.
Binary uses a flat array of 24-bit integers in a fixed order.

## Reference JS Code

The reference `parsers`/`stringifiers` in `reference.js` include v0 and a
different v1 (with `lavender` at index 4, overwriting `aqua`). The
open-source-arras client (`app.js:867–983`) has the canonical v0 parser
with `aqua` at index 4. The `reference.js` code is OLDER and uses a
different palette order for its v0 parser:

Old v0 order (reference.js):
  [0] teal [1] lgreen [2] orange [3] yellow [4]=teal(overwrite) [5] pink
  [6] vlgrey [7]=grey(overwrite) [8] guiwhite [9] black ...

Current order (open-source-arras / v1):
  [0] teal [1] lgreen [2] orange [3] yellow [4] aqua [5] pink
  [6] vlgrey [7] lgrey [8] guiwhite [9] black ...

The v1 format is authoritative. Use the 20-color table above.
