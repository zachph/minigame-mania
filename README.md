# Minigame Mania

A browser collection of small games. No build step, no dependencies — plain ES
modules, a canvas and a `<script type="module">`.

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

45 cases covering the type chart (symmetry, two strengths and two weaknesses
each), the roster (thirty final evolutions, equal stat budgets, every move
used), the battle engine (turn order, cooldowns, limited uses, status effects,
knockouts, the turn cap, seeded replay determinism), the AI (legal actions,
taking a knockout, sensible replacements) and the drawing code — every fighter
is rendered through a fake canvas that rejects non-finite coordinates. No
browser needed.
