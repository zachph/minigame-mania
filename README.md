# Minigame Mania

A browser collection of small games. No build step, no dependencies — plain ES
modules, a canvas and a `<script type="module">`.

**The games: [Catchmon](#catchmon) (3v3 type battles), [Nopoly](#nopoly)
(Red vs Blue on a chess board), [Shubat](#shubat) (a lane-and-deck duel) and
[Defensele](#defensele) (a tower defence that never pauses).**

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

Play the computer at three depths (Easy looks one move ahead, Normal three on a
short clock, Hard four — each capped by a time budget, so a crowded position
costs a shallower search rather than a frozen screen). Measured head to head,
Normal wins about a third of its games against the sharper build it replaced,
and still beats Easy every time. or hand the same screen to a second player. Click a piece and then a
highlighted square, or drive it with the arrow keys and Enter.

## Shubat

A deck duel across three lanes — a card game and a board game at once. Pick a
starter deck; the rival takes the other one.

| Deck | Feel | Passive |
| --- | --- | --- |
| **Iron Warrior** | Cheap, fast, relentless | **Breakthrough** — damage past a kill carries into the core |
| **String Brain** | Slow, enormous, outlasts you | **Foresight** — flavour for now; the deck's edge is its raw stats |

Twenty cards each: **5 fighters, 10 supports, 2 instant damage cards, 3 traps.**

### The fighters

HP and damage are fixed by hand; **cost is derived** —
`round(((hp + damage) / 200) ** 1.3)` — so a fighter's price is whatever its
numbers are worth, and the curve is what keeps the two decks honest.

| Iron Warrior | HP | Damage | Cost | | String Brain | HP | Damage | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Scrapper | 120 | 180 | 2 | | Brainer | 380 | 20 | 2 |
| Magnet Bot | 290 | 70 | 2 | | Calculator | 314 | 790 | 6 |
| Overdrive | 160 | 210 | 2 | | Coden | 1010 | 7 | 5 |
| Iron-Forge | 135 | 177 | 2 | | Puppeteer | 248 | 157 | 2 |
| Criptmetal | 401 | 101 | 3 | | Grand | 560 | 129 | 3 |

Calculator's numbers are written in the source as `297 + 17` and `1000 - 210`,
which is the arithmetic a card called Calculator ought to be doing.

### A turn

- You gain **one more energy each turn** (capped at 10) and draw a card.
- Play what you can afford: deploy a fighter into an empty lane, aim a support,
  fire an instant, or set a trap face down (three at a time).
- Then **attack**: every fighter that has been in play since your last turn
  strikes the lane opposite it. A blocked lane hits the blocker and nothing hits
  back; an **empty lane is a straight road to the core**.
- Traps fire on their own during the rival's turn — when a fighter lands, when
  your core is hit, when they cast an instant or a support.
- First core to zero loses. A match runs a little over twenty turns.

### How it is balanced

The fighter stats are a fixed spec, and on their own String Brain wins **75%**
of matches — it fields more than twice Iron Warrior's total HP. So the balance
lives in the parts around them, and each number below was measured over hundreds
of simulated matches rather than guessed:

- **The cost curve** (exponent 1.3) prices String's monsters out of the early
  game: Calculator and Coden do not land until turn five or six.
- **Breakthrough** gives Iron an answer to a 1010-HP wall.
- **Core HP, 1850** is the clock the aggressive deck races. At 1200 Iron wins
  76% of matches; at 2000 it wins 44%. At 1850 the decks are level.
- **Moving second** is worth an extra card and an extra energy, which takes the
  first-move advantage from 24 points down to about 5.

Each difficulty brings its own twenty: a **Trainee** deck (the same few cheap
cards over and over), the **Standard** deck, or a **Prototype** deck (one of
everything). Measured head to head the three builds are near enough equal, so
the ladder comes from how the rival plays and where its energy curve starts —
Easy is a turn behind you and misplays half the time, Hard is a turn ahead and
does not. Against a straight-playing opponent the player wins 96% on Easy, 54%
on Normal and 34% on Hard.

## Defensele

A tower defence on a fixed road, and the first game here that runs in real
time. There is **no build phase**: the next wave starts on its own timer whether
or not you are ready, so gold spent now is gold not spent on the wave already
walking towards you.

### The defenders

| Defender | First one | What it does |
| --- | --- | --- |
| **Pylon** | 45 | Two shots a second. The one you open with. |
| **Frostpin** | 80 | Barely scratches, but halves the speed of everything it touches. |
| **Bastion** | 115 | The only one built **in the road**. Nothing walks past until it is rubble. |
| **Claw-bind** | 135 | Grabs one enemy and pins it where it stands. |
| **Lancer** | 200 | One heavy shot from a long way off. Answers armour. |
| **Mortar** | 275 | A slow shell that catches everything near the landing. The answer to a Swarm. |
| **Coilnest** | 345 | Arcs from one target to the next, up to three. |
| **Nightkon** | 390 | Marks them with dread that keeps burning, three stacks deep, and ignores armour. |
| **Frostglide** | 465 | Freezes one enemy solid for 1.5s, biting 12.5 through armour every 0.5s. Short reach. |
| **Money Tree** | 285 | Fruits 100 gold every 6.5 seconds. Shoots at nothing, and a stun stops it paying. |

**Every repeat costs 20% more.** The column above is what the *first* one costs;
your second Pylon is 50, the third 55, the fifth 70. It is counted per defender,
so owning six Pylons does nothing to the price of your first Lancer, and selling
one steps its price back down. The opening is untouched - it is the tenth Lancer
that hurts.

### What comes at you

Creeper (basic) · Runner (fast, fragile) · Brute (slow, tough) · Shieldbearer
(flat armour, so small hits bounce) · Swarm (many at once) · **Cripplestone**
(1270 HP at Runner speed; every 4 seconds it puts the nearest working tower out
for 3.5, and costs eight lives if it gets through) · Colossus (2700 HP, resists
slows, and costs ten lives if it gets through).

Cripplestones walk in from wave 9 and get thicker every time, so the back half
of the run is fought with part of your defence dark at any moment.

**Skeleflame** closes the game out: 1865 HP at speed 75, eighteen lives if it
gets through, and **Flame Road** - every five seconds the whole track catches
fire for seven. While it burns, every Bastion loses 1% of its health every 0.2
seconds and nothing on the road can be frozen or chilled, so Frostpin and
Frostglide are dead weight until it goes out. The five-second wait only starts
once the fire does go out, so two of them overlapping means a road that is alight
almost the whole way. Waves 16 and 17 are nothing else: two of them, then four.

Seventeen waves, twenty lives. Kills pay, and each wave arriving pays a supply
bonus so the money keeps moving.

### How it is balanced

Every number was swept with a scripted builder playing all seventeen waves:

- **Wave gap, 16 seconds.** At 7 seconds nothing survived past wave 8 — waves
  stacked faster than any economy could answer. At 16 the pressure is constant
  but a good build keeps up.
- **The economy** opens at 100 gold with a per-wave supply bonus from wave two
  on. That is two Pylons on the first wave and nothing else, so the opening is a
  real decision. Wave one deliberately pays nothing: a bonus there would just be
  a 133-gold opening handed over three seconds late. Without the wave bonus
  entirely, a Lancer-first build could only afford two towers in eight waves.
- **Open cheap.** With no wave-one bonus the guns have to come before the
  expensive answers. 100 gold is two Pylons with 10 left over, and everything
  else on the bar is out of reach until the supply bonuses start landing.
- **The Money Tree is the run.** At these prices the sweep cannot find a build
  without one that survives past wave 12 - not a Pylon spam, not a spread of
  roles, not a Lancer-led rotation. With one it wins comfortably. **When** you
  buy it is the whole opening: four Pylons then the tree wins with 17-20 lives,
  two Pylons then the tree is a coin flip between a 2-life finish and dying on
  wave 6, and the tree before any gun at all is dead by wave 4. Three trees is
  dead by wave 6.
- **Keep buying.** Cripplestones from wave 9 mean a build that stops at sixteen
  towers is overrun on the last waves. The spread that wins clean is thirty
  towers deep and lands 26 stuns on the way.
- **The last two waves are the real test** for a run that got there without a
  tree's money behind it - one Skeleflame past you is worth eighteen lives, and
  eleven Flame Roads go off across the two waves. A run with a tree arrives with
  40-odd towers standing and turns them back without losing a life.
- **Prices are the whole difficulty curve, and a flat price list could not carry
  it.** Sweeping every flat re-costing from 0.75x to 2.6x, nothing fixed both
  ends at once: cheap enough to open with meant 44-57 towers standing by wave 17
  and a walkover, and dear enough to bite at wave 17 meant collapsing at wave 12.
  Cutting the supply bonus instead only made the opening worse. The 20%-per-
  repeat step is what separates the two: the first of everything stayed cheap
  and the seventh Lancer went from 180 to 395, which took the finish from 44
  towers and twenty lives to 32 towers and two.
- **The Money Tree is the strongest thing in the game, on purpose.** It costs
  150 and makes that back in thirteen seconds, and a single tree bought early
  fruits about 3700 gold over a run - more than wave bonuses and bounties put
  together. From roughly wave 3 on, gold stops being the thing that limits you;
  good ground and good timing do. Three trees before any guns still loses at
  wave 4, so it is not a free win. With Skeleflames at the end there is finally
  enough to spend it on: two trees and a long build finishes wave 17 on 15 lives
  against the same build's 2 without them.
- Sloppy builds fail: **pylons only** is overrun at wave 14 and **cheap swarm**
  at wave 13. **Lancers only** survives with half its lives gone, and a **spread
  of roles** wins clean — which is the curve you want: mastery is rewarded,
  one-note is punished.
- **The expensive end is genuinely expensive.** Nightkon at 200 and Frostglide
  at 230 cannot be opened with, and the sweep shows it: a **dread stack** that
  used to limp to the last wave now dies at wave 6, and **frostglide only**
  falls at wave 4 with one tower on the board. Both are things you buy once the
  cheap guns have paid for them.

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
    cards.js           both decks: fighters, supports, instants, traps
    rules.js           lanes, energy, combat, traps, the win (pure logic)
    ai.js              the rival: one scoring pass, three difficulties
    render.js          the board, the cards, the hand
    ui.js              the deck-choice screen
    game.js            turn flow, targeting, scoring
  games/defensele/
    content.js         the ten defenders, eight enemies and seventeen waves
    rules.js           the road, building, movement, shooting, waves (pure logic)
    render.js          the map, the road, everything standing on it
    ui.js              the build bar
    game.js            placement, selling, scoring
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

108 cases. For Catchmon: the type chart (symmetry, two strengths and two weaknesses
each), the roster (thirty final evolutions, equal stat budgets, every move
used), the battle engine (turn order, cooldowns, limited uses, status effects,
knockouts, the turn cap, seeded replay determinism), the AI (legal actions,
taking a knockout, sensible replacements) and the drawing code — every fighter
is rendered through a fake canvas that rejects non-finite coordinates. For
Nopoly: the opening position (eighteen pieces, reflected), how each piece moves
including the dragon's asymmetry from both sides,
that nothing jumps, captures, immutability of a position after a move, illegal
moves being refused, every way a match can end, and an AI that only plays legal
moves and takes a free golem. For Shubat: that every fighter carries exactly the
stats it was given, that all six decks are twenty cards in the right shape,
energy, deployment, combat in and out of a lane, Breakthrough belonging to Iron
alone, buffs, shields, tangling, instants, traps firing and cancelling, and that
the difficulty ladder actually climbs. For Defensele: the road and which cells
sit on it, where each defender may be built, gold in and out, armour blunting
small hits while dread ignores it, slows and snares, a Bastion holding the queue
until it falls, lives lost to leaks, and — the one that guards the balance — an
undefended base being overrun while a spread of defenders turns all fifteen
waves back. No browser needed.
