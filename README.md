# Minigame Mania

A browser collection of small arcade games. No build step, no dependencies —
plain ES modules, a canvas and a `<script type="module">`.

**First minigame: Catchmon.**

## Play

The game uses ES modules, so it needs to be served over HTTP (opening
`index.html` from disk will not work):

```bash
npm start          # python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server does the job — `npx http-server`, `php -S`, etc.

## Catchmon

Sixty seconds, one meadow full of wild mons, twenty-four balls.

- **Aim** with the mouse, or the arrow keys / WASD.
- **Hold** to charge a focused throw, **release** to throw. `Space` works too.
- Land the ball **dead centre** on a mon for the best odds — a graze usually
  fails.
- A landing **spooks** every mon nearby, and a fleeing mon is harder to catch.
- Every catch **refunds a ball** and grows the **streak multiplier** (up to x3).
  A miss or an escape resets the streak.
- The round ends when the clock runs out — or early if you run out of balls.

Catch odds come from the species' base rate, how centred the throw was, how far
it was charged and whether the mon was fleeing (`catchChance()` in
`src/games/catchmon/game.js`). Rarer species score more, move faster, are harder
to catch, and show up more often late in a round.

| Species  | Rarity | Points |
| -------- | ------ | ------ |
| Sproutle | ★      | 100    |
| Emberkit | ★★     | 190    |
| Dripso   | ★★     | 210    |
| Zapling  | ★★★    | 340    |
| Umbrix   | ★★★★   | 560    |
| Prismon  | ★★★★★  | 1200   |

High scores and the species you have caught are kept in `localStorage` (and
fall back to memory when site data is blocked).

## Layout

```
index.html
src/
  main.js              app entry: registers the minigames, boots the shell
  styles.css
  core/
    shell.js           screens, the rAF loop, pause/resume, results
    registry.js        the minigame catalogue
    input.js           pointer + keyboard -> per-frame snapshot
    storage.js         localStorage with a memory fallback
    utils.js           maths and canvas helpers
  games/catchmon/
    index.js           registration + how-to-play copy
    game.js            round logic, mon behaviour, scoring
    render.js          all the drawing
    species.js         the roster
    constants.js       field bounds and tuning knobs
test/                  node:test suites (logic, a simulated round, a render smoke test)
```

## Adding a minigame

Register it from `src/main.js`:

```js
registerGame({
  id: 'stackomat',
  name: 'Stack-o-Mat',
  tagline: 'Time your drops and build the tallest tower.',
  howTo: ['<strong>Click</strong> to drop a block.'],
  create: (context) => new StackOMat(context),
});
```

`create(context)` returns the instance the shell drives:

- `update(dt, input)` — advance by `dt` seconds using the [`Input`](src/core/input.js) snapshot.
- `render(ctx)` — draw into a fixed 960x540 logical space (the shell handles
  scaling and HiDPI).
- `destroy?()` — release anything held.

`context` carries `{ width, height, highScore, finish(result) }`. Call
`finish({ score, title, collected, emptyText })` to end the round; the shell
stores the high score and shows the results screen.

## Tests

```bash
npm test    # node --test
```

The suite covers the shared helpers, Catchmon's scoring and catch-chance rules,
and drives a full simulated round (spawning, throwing, catching, the round-end
conditions) with a fake input and a fake canvas context — no browser needed.
