# Letterloom

Two-player crossword tiles on a 15×15 board. Same screen, take turns — or play the computer.

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

1. Enter two names, or choose **Play the computer** and a difficulty (or load a saved game). Closest tile to **A** goes first; blanks win the draw. Against the computer you can also start in **Coach mode**.
2. Each turn: play a word, exchange tiles, or pass. The computer moves automatically. The sidebar keeps a turn log. **Take Back** undoes the last turn (and the computer’s reply); the bag is reshuffled. **Replay** opens the full history; **Local stats** reads finished games stored in this browser.
3. Select a rack tile, place it on the board, then **Play Word**. Click a pending tile to take it back. In Coach mode, **Hint** drops the best available play onto the board, and the log notes that play after your turn.
4. First word must cover the center ★. Later words must connect. All formed words (including crosses) must be in the dictionary.
5. Blank tiles pick a letter when placed. Exchange needs 7+ tiles in the bag. Tap **N in bag** for the unseen A–Z leftover grid (bag plus opponents’ racks). After the game it shows every tile still off the board. Game over offers **Rematch** (same names, mode, and difficulty; first player rotates).

**Score:** letter values × DL/TL; word × DW/TW on newly placed tiles only. All 7 tiles in one turn: +50. Game ends when someone empties their rack and the bag is empty, or everyone passes. Leftover tiles subtract; the finisher gains opponents’ leftovers.

| Square | Meaning |
|--------|---------|
| DL / TL | Double / triple letter |
| DW / TW | Double / triple word (center ★ is DW) |

## Save

Games live in this browser’s local storage and auto-update after each move once named. Computer games store the mode, which seat the computer occupies, the difficulty, and whether Coach mode is on. Older two-player saves still load.

| | |
|--|--|
| **Save** / **Export** / **Local stats** | Sidebar |
| **Load** / **Delete** / **Import** / **Local stats** | Start screen |

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
js/           engine.js, storage.js, ai.js, ai-worker.js, ui.js
data/words.txt   ~178k free lexicon
tests/        node tests for the engine and computer opponent
LICENSE          MIT
```

The computer searches legal moves in a Web Worker with the same dictionary and engine used for human play. It only sees the board, its own rack, and public information (scores, bag count) — not your rack or the order of tiles in the bag.

| Difficulty | How it chooses among legal moves |
|------------|----------------------------------|
| Easy | Picks from a lower-scoring band of reasonable plays |
| Medium | Favors score with a little rack-leave balance, then picks among the top few |
| Hard | Takes the highest `score + 0.85 × leaveValue`. `leaveValue` is a static estimate (S and blanks valued; awkward leftovers penalized). Hard is **not** an exhaustive or optimal strategy search |

Random choices are seedable so tests can replay the same decision. If no legal placement exists, the computer exchanges when the bag has at least 7 tiles; otherwise it passes.

```bash
node tests/ai.test.js
node tests/history-coach.test.js
node tests/unseen-stats.test.js
```

## License

MIT for the code. Keep `data/words.txt` as a free lexicon (e.g. ENABLE). Do not ship NASPA or Collins word lists, and do not present this as Scrabble.
