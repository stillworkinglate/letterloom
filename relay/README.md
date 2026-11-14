# Letterloom relay

The small service behind **Play online**. It holds each online game so two phones can read and write the same board. The game itself stays on GitHub Pages; only this folder runs on Vercel.

It is one function (`api/room.js`) and a Redis database. There are no dependencies to install.

## Set up

1. **Create the project.** In Vercel: **Add New → Project**, import this repository, and set **Root Directory** to `relay`. Leave the framework as **Other** and the build settings empty. Deploy.
2. **Add the database.** In the project: **Storage → Create Database → Upstash → Redis**. The free plan is enough. Connect it to this project for all environments.
3. **Redeploy** (**Deployments → ⋯ → Redeploy**), so the function picks up the database settings.
4. **Check it.** Use the project's production address, not a preview one:

   ```bash
   node relay/smoke-test.js https://YOUR-PROJECT.vercel.app/api/room
   ```

5. **Point the game at it.** In `index.html`, set `RELAY_URL` to that same address and push. **Play online** appears on the setup screen once it is set.

## Try it on your own machine

```bash
node relay/dev-server.js          # stands in for Vercel; rooms live in memory
python3 -m http.server 8080       # from the repository root, in another terminal
```

Open http://localhost:8080 in two different browsers (or one normal and one private window), start an online game in one, and open the invite link in the other.

## How it works

| Request | Does |
|---|---|
| `POST /api/room` with `{ state }` | Creates a game and returns its 6-character code |
| `GET /api/room?code=…&v=…` | Returns the game, or `unchanged` if the caller is up to date |
| `PUT /api/room?code=…` with `{ v, state }` | Saves a move, but only if `v` is still the current version |

Each write must name the version it was based on. If the other phone wrote first, the write is refused and the caller gets the current game back. Games are deleted 30 days after the last move.

## Limits to know about

- **Anyone with the code can open the game.** The code is the only key. A third person who opens a full game is asked which of the two players they are.
- **Each phone receives the whole game,** including the other player's rack and the bag. The screen hides them, but someone using browser developer tools could look. This is fine between friends and not suitable for strangers or stakes.
- **There is no rate limiting.** Game states are capped at 200 KB.
