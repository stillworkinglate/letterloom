# Letterloom

Two-player crossword tiles on a 15×15 board. Same screen, take turns.

**[Play](https://stillworkinglate.github.io/letterloom/)** · [Source](https://github.com/stillworkinglate/letterloom)

Not affiliated with Scrabble, Hasbro, Mattel, or Zynga.

## Run

Serve the folder (the dictionary will not load from a `file://` URL):

```bash
python3 -m http.server 8080
# or: npx serve -p 8080
```

Open http://localhost:8080

## Play

1. Enter two names (or load a saved game). Closest tile to **A** goes first; blanks win the draw.
2. Each turn: play a word, exchange tiles, or pass.
3. Select a rack tile, place it on the board, then **Play Word**. Click a pending tile to take it back.
4. First word must cover the center ★. Later words must connect. All formed words (including crosses) must be in the dictionary.
5. Blank tiles pick a letter when placed. Exchange needs 7+ tiles in the bag.

**Score:** letter values × DL/TL; word × DW/TW on newly placed tiles only. All 7 tiles in one turn: +50. Game ends when someone empties their rack and the bag is empty, or everyone passes. Leftover tiles subtract; the finisher gains opponents’ leftovers.

| Square | Meaning |
|--------|---------|
| DL / TL | Double / triple letter |
| DW / TW | Double / triple word (center ★ is DW) |

## Save

Games live in this browser’s local storage and auto-update after each move once named.

| | |
|--|--|
| **Save** / **Export JSON** | Sidebar |
| **Load** / **Delete** / **Import** | Start screen |

Export a `.json` if you want a backup or to move a game to another machine.

## Board

```
TW  .   .  DL  .   .   .  TW  .   .   .  DL  .   .  TW
 .  DW  .   .  .  DL  .   .   .  DL  .   .   .  DW  .
 .   .  DW  .   .   .   .  DL  .   .   .   .  DW  .  .
DL  .   .  DL  .   .   .   .   .   .   .  DL  .   . DL
 .   .   .   .  DW  .   .   .   .   .  DW  .   .   .
 .   .   .   .   .  DW  .   .   .  DW  .   .   .   .
 .  DL  .   .   .   .  TL  .  TL  .   .   .  DL  .  .
TW  .   .  DL  .   .   .  ★   .   .   .  DL  .   .  TW
 .  DL  .   .   .   .  TL  .  TL  .   .   .  DL  .  .
 .   .   .   .   .  DW  .   .   .  DW  .   .   .   .
 .   .   .   .  DW  .   .   .   .   .  DW  .   .   .
DL  .   .  DL  .   .   .   .   .   .   .  DL  .   . DL
 .   .  DW  .   .   .   .  DL  .   .   .   .  DW  .  .
 .  DW  .   .  .  DL  .   .   .  DL  .   .   .  DW  .
TW  .   .  DL  .   .   .  TW  .   .   .  DL  .   .  TW
```

## Keyboard

Arrow keys move the focused board cell. Tab leaves the grid. Skip links jump to the rack or controls.

## Files

```
index.html
css/          style.css, mobile.css
js/           engine.js, storage.js, ui.js
data/words.txt   ~178k free lexicon
LICENSE          MIT
```

## License

MIT for the code. Keep `data/words.txt` as a free lexicon (e.g. ENABLE). Do not ship NASPA or Collins word lists, and do not present this as Scrabble.
