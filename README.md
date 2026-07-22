# Letterloom

*Weave words from your letter tiles.*

A turn-based 2-player crossword tile game that runs in your browser. Two players share one screen and take turns building words on a 15×15 grid.

**Play online:** [https://stillworkinglate.github.io/letterloom/](https://stillworkinglate.github.io/letterloom/)

**Source:** [github.com/stillworkinglate/letterloom](https://github.com/stillworkinglate/letterloom)

> Not affiliated with Scrabble, Hasbro, or Mattel. Letterloom is an independent word game.

## Run locally

You need a local web server so the game can load the word dictionary. Opening `index.html` directly in the browser will not work.

### Option 1: Python (recommended)

```bash
cd /path/to/scrabble
python3 -m http.server 8080
```

Open **http://localhost:8080** in your browser.

### Option 2: Node.js

```bash
npx serve -p 8080
```

### Option 3: PHP

```bash
php -S localhost:8080
```

Stop the server with `Ctrl+C` when you're done.

---

## How to play

### Setup

1. Open the game in your browser (see above).
2. Wait for the dictionary to load.
3. On the start screen, pick a game from **Saved Games** and click **Load**, or enter two player names and click **Start Game**.
4. The player whose drawn tile is closest to **A** goes first (blank tiles beat all letters).

### Your turn

Each turn you may do one of three things:

| Action | How |
|--------|-----|
| **Play a word** | Select a rack tile → click board squares to place → click **Play Word** |
| **Exchange tiles** | Click **Exchange** → select tiles from your rack → **Confirm Exchange** |
| **Pass** | Click **Pass** (clear any pending placements first) |

### Placing tiles

- Click a tile in your rack to select it, then click an empty board square to place it.
- Click a pending (preview) tile on the board to remove it.
- Direction is detected automatically: tiles in the same row play **across**, same column plays **down**.
- The first word must cover the center **★** square.
- Every new word must connect to tiles already on the board.
- All words formed (including cross-words) must be valid dictionary words.
- Blank tiles ask for a letter when placed.

### Scoring

Points are calculated automatically:

- Add up the value of all letters you play.
- **DL** (light blue) — double letter value
- **TL** (blue) — triple letter value
- **DW** (pink) — double word score (center ★ is DW)
- **TW** (red) — triple word score
- Premiums apply only to **newly placed** tiles.
- **+50 bonus** if you play all 7 tiles in one turn (a "bingo").

The score preview in the sidebar updates as you place tiles.

### Winning

The game ends when:

- A player plays their last tile **and** the tile bag is empty, or
- All players pass in succession.

At the end, leftover rack tiles are subtracted from each player's score. The player who emptied their rack also gains the value of opponents' remaining tiles.

---

## Saving and resuming

### Saved games library

The start screen lists all saved games stored in your browser. Each entry shows player names, scores, whose turn it is, and when it was saved.

| Button | Where | What it does |
|--------|-------|--------------|
| **Save** | In-game sidebar | Saves the current game (prompts for a name on first save) |
| **New Game** | In-game sidebar | Returns to the start screen to load or start another game |
| **Load** | Start screen | Opens a saved game |
| **Delete** | Start screen | Removes a saved game from the library |
| **Export JSON** | In-game sidebar | Downloads a `.json` backup file |
| **Import Save File** | Start screen | Adds a `.json` file to your saved games library |

Once a game is saved, it **auto-updates** in the background after every move.

Store exported `.json` files in the `saves/` folder for backups:

```
saves/
  alice-vs-bob-2026-07-03.json
  friday-night-game.json
```

> **Note:** The saved games library lives in this browser's local storage. Use **Export JSON** to back up or move games to another machine.

---

## Board reference

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

---

## Rules implemented

- Standard 15×15 board with TW, DW, TL, and DL premium squares
- 100-tile bag with official letter counts and point values
- Automatic scoring with letter and word multipliers (new tiles only)
- +50 bingo bonus for playing all 7 tiles in one turn
- Exchange allowed only when 7+ tiles remain in the bag
- End-game tile adjustments (subtract unplayed tiles; finisher adds opponents' leftovers)
- ~178k dictionary words for validation

---

## Project structure

```
scrabble/
├── index.html          # Entry point
├── css/style.css       # Board and UI styling
├── js/
│   ├── engine.js       # Game logic, validation, scoring
│   ├── storage.js      # Auto-save, JSON export/import
│   └── ui.js           # Turn-based UI for same-screen play
├── data/
│   └── words.txt       # Dictionary (~178k words)
├── saves/              # Store exported .json save files here
└── README.md
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Could not load the word dictionary" | Start a local server from the project folder (don't open `index.html` directly) |
| Save didn't restore | Use the same browser; load from **Saved Games** on the start screen, or **Import Save File** |
| Import failed | Make sure the file is a valid Letterloom save exported from this game |
| Word rejected | It may not be in the dictionary, or the placement creates an invalid cross-word |