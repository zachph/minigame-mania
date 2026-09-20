# The friends server

Names, friend lists, challenges, and the handful of messages two people need to
play a match. Node builtins only - no framework, no database, nothing to
install.

```sh
node server/server.js          # listens on :8787
PORT=9000 node server/server.js
DATA_FILE=/somewhere/players.json node server/server.js
```

State lives in one JSON file (`server/data/players.json` by default). Back it up
by copying it; read it in any editor if something looks wrong.

## Pointing the game at it

Open the game, click the name pill in the top right, and put the server's
address in the **Friends server** box. It is remembered per browser. While you
are running both on one machine that is `http://localhost:8787`.

## Putting it on the internet

Anywhere that runs a Node process works - Fly.io, Render, Railway, a Raspberry
Pi at home with a tunnel. The server needs:

- **A port from `PORT`.** It already reads it.
- **A disk that survives restarts** for `DATA_FILE`, or the names go away when
  the host recycles the machine. On hosts with an ephemeral filesystem, mount a
  volume and point `DATA_FILE` at it.
- **HTTPS.** Browsers will not let a page served over `https://` talk to a
  server over `http://`, so a plain-http server cannot be reached from the
  GitHub Pages site. Every host above terminates TLS for you.

Then put that `https://...` address in the Friends server box.

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
