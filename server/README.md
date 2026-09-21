# The friends server

Names, friend lists, challenges, and the handful of messages two people need to
play a match. Node builtins only - no framework, no database, nothing to
install.

```sh
npm run server                 # listens on :8787
PORT=9000 npm run server
DATA_FILE=/somewhere/players.json npm run server
```

**It serves the game as well as the API.** Open `http://localhost:8787` and
that is the whole thing - the games, your name, your friends, your matches -
from one address. There is nothing to configure, because the page asks the
server it came from.

State lives in one JSON file (`server/data/players.json` by default). Back it
up by copying it; read it in any editor if something looks wrong. The file is
never served to browsers - only `index.html`, `src/` and `dist/` are public.

## Playing someone else

**Same wifi.** Start the server and give them your computer's address instead
of `localhost` - something like `http://192.168.1.14:8787`. Nothing else to do.

**Anywhere else.** The server has to live somewhere online. Every option below
gives it HTTPS, which it needs: a page served over `https://` is not allowed to
talk to a server over plain `http://`, so an http-only server cannot be reached
from a normal web address at all.

### Fly.io

```sh
fly launch --no-deploy            # reads fly.toml, pick a name
fly volumes create game_data -s 1 # the names live here
fly deploy
```

### Render

New → Blueprint → point it at this repo. `render.yaml` sets the start command,
the health check and the disk.

### Anything that runs Docker

```sh
docker build -t minigame-mania .
docker run -p 8080:8080 -v game_data:/data minigame-mania
```

Whichever you pick, the address it gives you *is* the game. Send that link to
whoever you want to play.

## How the accounts work

There are no passwords. Claiming a name gets you a random token, the browser
keeps it, and every call carries it. The server stores only a SHA-256 of the
token, so the data file leaking does not hand anyone an account.

What that costs: the token **is** the account. Clear your site data and the name
is gone - you cannot recover it, and nor can the server. Playing on a second
device means either copying the token across or picking a second name.

Names are the only thing players can type that other players see, and they are
checked against `^[A-Za-z0-9 _-]{3,16}$` before they are stored. There is no
chat, so there is nothing else to moderate.

## What it does not do

It relays what a player's own browser reports. Two friends playing each other
can, in principle, lie about their score. Locking that down means running the
games on the server, which is a far bigger thing than this - fine between
friends, not fine for a public leaderboard.

## Endpoints

| Call | Does |
| --- | --- |
| `POST /api/signup` | Claim a name, get a token |
| `GET /api/me` | Your name, friends, requests and challenges |
| `GET /api/players?q=` | Find someone by name |
| `POST /api/friends/request` \| `/respond` \| `/remove` | Friend list |
| `POST /api/challenges` \| `/respond` \| `/cancel` | Challenges |
| `POST /api/match/send` \| `/finish` \| `/quit` | In-match relay and results |
| `GET /api/stream?token=` | Server-Sent Events: everything above, pushed |
