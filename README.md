# Minigame Mania

A browser collection of small games. No build step, no dependencies — plain ES
modules, a canvas and a `<script type="module">`.

**The games: [Catchmon](#catchmon) (3v3 type battles), [Nopoly](#nopoly)
(Red vs Blue on a chess board) and [Shubat](#shubat) (a card duel).**

## Play

**The quickest way: open `dist/minigame-mania.html`.** It is both games bundled
into one self-contained file — download it, double-click it, and it runs in your
browser. Nothing to install, no server, works offline.

To run the source instead: it uses ES modules, so it needs to be served over
HTTP (opening `index.html` straight off disk will not work).

```bash
npm start          # python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server does the job — `npx http-server`, `php -S`, etc.

Rebuild the single file after changing anything under `src/`:

```bash
npm run bundle     # writes dist/minigame-mania.html
```

## Putting it on the web

This is a plain static site: no build step, no server code, no dependencies.
Any static host serves it by pointing at the repository root — `index.html` is
already there. **There is nothing to deploy until the code is on the branch your
host is watching, which is almost always `main`.**

**Vercel** — import the repository at [vercel.com/new](https://vercel.com/new):

- Framework preset: **Other**
- Build command: **leave empty** (there is nothing to build)
- Output directory: **leave empty** (the repository root)
- Install command: leave empty

Every push to `main` then redeploys. The site lives at the URL Vercel gives you
on the project's dashboard — that exact hostname, which is not necessarily the
repository's name.

**GitHub Pages** — Settings → Pages → Source: *Deploy from a branch* → Branch:
`main`, folder `/ (root)` → Save. It appears at
`https://<user>.github.io/<repo>/` about a minute later. Note that Pages on a
**private** repository needs a paid GitHub plan; on the free plan, make the
repository public first.

If a URL says *"this site can't be reached"*, nothing is deployed at that
hostname — the browser could not connect at all. A deployed site that is merely
missing a file answers with a 404 page instead.

## Catchmon

A turn-based 3-on-3 type battle. The rival team is drafted and shown to you
first; you pick three fighters from a roster of thirty to answer it, then fight.

### The six types

The chart is a cycle. Every type is **strong against the next two** and
**resisted by the previous two**, which leaves exactly one neutral matchup. No
type is better than another.

```
Fire → Grass → Wind → Dark → Water → Rock → (back to Fire)
```

So Fire beats Grass and Wind, is resisted by Water and Rock, and is neutral with
Dark. Super effective is x1.5, resisted is x0.66, and using a move of your own
type adds x1.25.

| Type  | Beats        | Weak to      | Neutral with |
| ----- | ------------ | ------------ | ------------ |
| Fire  | Grass, Wind  | Water, Rock  | Dark         |
| Grass | Wind, Dark   | Fire, Rock   | Water        |
| Wind  | Dark, Water  | Grass, Fire  | Rock         |
| Dark  | Water, Rock  | Wind, Grass  | Fire         |
| Water | Rock, Fire   | Dark, Wind   | Grass        |
| Rock  | Fire, Grass  | Water, Dark  | Wind         |

The cycle is defined by the order of the `TYPES` array in
[`types.js`](src/games/catchmon/types.js) — reorder it and the whole chart
follows, with nothing else to change. A six-type cycle cannot satisfy every
intuition at once: this arrangement keeps Rock over Fire and Water over Rock,
and pays for it with Rock over Grass.

### The roster

Thirty fighters, five per type — **final evolutions only**. Each names the form
it evolved from as flavour, but no earlier stage is playable.

Every type fields one of each role, and every fighter spends exactly the same
340 stat points:

| Role     | Shape of it                                    | HP  | ATK | DEF | SPD |
| -------- | ---------------------------------------------- | --- | --- | --- | --- |
| Vanguard | Heavy hitter with the bulk to trade blows      | 128 | 84  | 68  | 60  |
| Striker  | Glass cannon: hits hardest, folds fastest      | 100 | 98  | 50  | 92  |
| Bulwark  | Slow wall that outlasts what it is fighting    | 144 | 58  | 92  | 46  |
| Runner   | Moves first, chips away, refuses to sit still  | 102 | 76  | 56  | 106 |
| Keystone | No weak stat and an answer for most turns      | 118 | 74  | 72  | 76  |

| Type  | Vanguard   | Striker    | Bulwark   | Runner    | Keystone  |
| ----- | ---------- | ---------- | --------- | --------- | --------- |
| Fire  | Pyrothane  | Cindralisk | Magmoth   | Ashenmane | Kilnhorn  |
| Grass | Thornmaw   | Bloomquill | Mosslok   | Saplynx   | Verdrake  |
| Rock  | Craghide   | Quarrion   | Boulderox | Duneclaw  | Geodon    |
| Wind  | Galehart   | Zephyris   | Cirrolith | Galevane  | Skydrake  |
| Water | Tidalon    | Maelstrix  | Frostfin  | Coralynx  | Abyssarch |
| Dark  | Nyxmaw     | Hexaraven  | Umbrathis | Duskgeist | Eclipsar  |

These names are placeholders — see [Making it yours](#making-it-yours).

### A turn

Both sides commit an action, then it resolves: switches go first, then moves by
priority, then by speed. Everyone knows four moves — three drawn from their own
type plus a neutral one.

- **Heavy moves recharge.** Big hits sit on a cooldown for a couple of turns.
- **Sustain is limited.** Mend and Second Wind work twice a battle, Shield three
  times, so stalling is not a plan.
- **Status matters.** Fire burns (chip damage, weaker attacks), Water chills
  (halved speed), Wind leaves the foe reeling (may cost a turn), Grass roots
  (cannot switch out), Rock shreds defence and Dark hexes attack.
- **Stat stages** run from -3 to +3 at x1.25 a step, and reset when a fighter
  switches out.
- Battles are capped at 40 turns; if the cap is hit, the healthier team wins.

Score rewards winning fast and healthy. Your score, and which fighters you have
battled with, are kept in `localStorage` (falling back to memory when site data
is blocked).

## Nopoly

Red against Blue on an 8x8 chess board. Nine pieces a side, eighteen in all.

| Piece      | Each side has | Moves                                                       |
| ---------- | ------------- | ----------------------------------------------------------- |
| **Farmer** | 6             | One square up, down, left or right.                           |
| **Golem**  | 2             | Up to two squares in any of the eight directions.             |
| **Dragon** | 1             | Six squares forward, three back, two sideways, four diagonal. |

The dragon starts on d of the back rank with a golem either side at c and f;
the farmers fill b–g on the rank in front. Red moves first.

**Forward means away from your own back rank** — Red advances up the board and
Blue advances down it — so the dragon's asymmetry cuts the same way for both
players, and the two armies are exact reflections of each other.

- **Nothing jumps.** Any piece in the path blocks it, friend or enemy.
- **Landing on an enemy captures it.** There is no separate capture move.
- **Win by capturing every enemy piece.** If 25 turns pass with nothing taken,
  the match is called for the bigger army — or drawn if the armies are even.

Play the computer at three depths (Easy looks one move ahead, Normal three,
Hard four — each capped by a time budget, so a crowded position costs a
shallower search rather than a frozen screen) or hand the same screen to a second player. Click a piece and then a
highlighted square, or drive it with the arrow keys and Enter.

## Shubat

A trick duel over thirty-two cards against the rival — four herds of eight:
**Camels, Horses, Falcons, Yurts**.

- **A card's number is both its strength and its worth.** An eight wins the
  trick and scores eight when you collect it. 144 points a deal.
- One card is turned up to set the **trump herd**, and sits under the stock as
  the last card anyone draws. A trump beats any other herd.
- Both players hold five. **Play anything you like while the stock lasts** — the
  higher card of the led herd takes the trick, a trump takes it outright.
- The winner leads the next trick and **draws first**.
- **Once the stock is empty you must follow the led herd** if you can, which
  turns the last five tricks into a real endgame.
- A match is **two deals**: you lead one, the rival leads the other. Most points
  over both wins.

Two deals rather than one because leading the first trick is worth about six
points a deal — measured over 300 self-play matches, the side that led first won
57% of them. One deal could not be fair; alternating the lead is.

The rival plays off its own hand and what everyone has seen — it never looks at
yours. Once the stock is empty that stops mattering: every remaining card is
public by counting, so **Hard** switches to searching the last tricks exactly.
Easy plays by feel and often the wrong card; Normal wins the tricks worth
winning and dumps the rest.

## Making it yours

Names and type assignments all live in one table — `ENTRIES` in
[`roster.js`](src/games/catchmon/roster.js). Each row is:

```js
[ id, name, type, role, shape, evolvesFrom, blurb, statTweak ]
```

- **id** — lowercase and unique; it is what saved records key off.
- **type** — `fire` | `grass` | `rock` | `wind` | `water` | `dark`. Change it and
  the fighter's move set, colours and crest follow automatically.
- **role** — `vanguard` | `striker` | `bulwark` | `runner` | `keystone`; sets the
  stat spread and which four move slots it fills.
- **shape** — `quad` | `biped` | `serpent` | `winged` | `orb`; picks the body plan
  it is drawn from.
- **evolvesFrom** — the earlier form's name. Flavour only: every fighter in the
  game is a final evolution, and no earlier stage is playable.
- **statTweak** — must net to zero, e.g. `{ atk: 4, spd: -4 }`, so every fighter
  keeps the same 340-point budget.

`npm test` enforces the invariants after an edit: thirty fighters, five per
type, one of each role per type, unique ids and names, equal stat budgets, and
no move left unused.

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
  games/shubat/
    cards.js           the deck, card values, who takes a trick
    rules.js           deals, legal plays, drawing, scoring (pure logic)
    ai.js              the rival: heuristics, counting, an exact endgame
    render.js          the table, the cards, the hand fan
    ui.js              the pre-match panel
    game.js            turn flow, animation, two-deal match
  games/nopoly/
    rules.js           board, moves, captures, the verdict (pure logic)
    ai.js              alpha-beta search, three difficulties
    render.js          board, pieces, move hints
    ui.js              setup screen and the side panel
    game.js            selection, animation, scoring
  games/catchmon/
    index.js           registration + how-to-play copy
    types.js           the six types and the effectiveness cycle
    moves.js           44 moves: six archetypes per type plus neutrals
    roster.js          the thirty final evolutions
    battle.js          the engine: turns, damage, status, knockouts (pure logic)
    ai.js              the rival: drafting and turn decisions
    art.js             procedural fighter art (five body plans x six crests)
    scene.js           arena, HP panels, popups
    ui.js              DOM team-select screen and battle commands
    game.js            phases, event playback, scoring
test/                  node:test suites
tools/
  build-single-file.mjs  inlines everything into dist/catchmon.html
dist/
  minigame-mania.html  both games in one file (generated, committed)
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

`context` carries `{ width, height, highScore, ui, finish(result) }`, where `ui`
is a DOM layer over the canvas the game may fill with its own controls. Call
`finish({ score, title, detailTitle, collected })` to end the round; the shell
stores the high score and shows the results screen.

## Tests

```bash
npm test    # node --test
```

89 cases. For Catchmon: the type chart (symmetry, two strengths and two weaknesses
each), the roster (thirty final evolutions, equal stat budgets, every move
used), the battle engine (turn order, cooldowns, limited uses, status effects,
knockouts, the turn cap, seeded replay determinism), the AI (legal actions,
taking a knockout, sensible replacements) and the drawing code — every fighter
is rendered through a fake canvas that rejects non-finite coordinates. For
Nopoly: the opening position (eighteen pieces, reflected), how each piece moves
including the dragon's asymmetry from both sides,
that nothing jumps, captures, immutability of a position after a move, illegal
moves being refused, every way a match can end, and an AI that only plays legal
moves and takes a free golem. For Shubat: the deck and its point total, who
takes a trick in every combination, the follow-suit rule appearing only when the
stock empties, drawing order, that a deal is sixteen tricks with all 144 points
accounted for, that the rival never sees your hand, and that it plays a stronger
game on Hard than on Easy. No browser needed.
