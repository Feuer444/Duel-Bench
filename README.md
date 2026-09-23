# DUEL//BENCH

A real-time 1v1 gamer benchmark for two players. Create a room, share the five-character code, ready up, and play the exact same seeded challenges.

## Match formats

### Ultimate 11
All available tests:

1. Reaction Time
2. Sequence Memory
3. Aim Trainer (30 targets)
4. Number Memory
5. Verbal Memory
6. Chimp Test
7. Visual Memory
8. Typing
9. Tracking
10. WASD Reflex
11. Click Burst

### Human 8
The eight core Human Benchmark-style categories:

- Reaction Time
- Sequence Memory
- Aim Trainer
- Number Memory
- Verbal Memory
- Chimp Test
- Visual Memory
- Typing

### Gamer 5
The faster mechanical duel:

- Reaction Time
- Aim Trainer
- Tracking
- WASD Reflex
- Click Burst

The host can switch formats in the lobby before both players ready up.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

For another computer on the same home network, use the host computer's local IPv4 address instead of `localhost`, for example:

```text
http://192.168.1.25:3000
```

Windows command to find it:

```powershell
ipconfig
```

Look for `IPv4 Address` on the network adapter you are using.

## Put it online — easiest method: GitHub + Render

This is a Node/Express + Socket.IO application, so it must be deployed as a **Web Service**, not as a static website.

### 1. Put the project on GitHub

Create a new empty GitHub repository, then from this project's folder run:

```bash
git init
git add .
git commit -m "Initial DUEL BENCH"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

If you do not want to use Git commands, GitHub Desktop can publish this folder as a new repository instead.

### 2. Deploy on Render

In Render:

1. Create a **New Web Service**.
2. Connect the GitHub repository containing this project.
3. Runtime: **Node**.
4. Build command: `npm install`
5. Start command: `npm start`
6. Choose the Free instance if this is only for testing with friends.
7. Create the service.

The included `render.yaml` already contains the same deployment configuration and `/health` is included for health checks.

When deployment finishes, Render gives you a public HTTPS address similar to:

```text
https://your-game-name.onrender.com
```

Open that address, create a room, and send the same address plus the room code to your friend. Your friend can be on a completely different internet connection. No router port forwarding is required.

### Free Render caveat

Free Render web services can sleep after being idle. The first person opening the game after it has slept may have to wait for it to wake up. Once the server is awake, both players can connect normally.

## Railway alternative

Railway also supports Express and Socket.IO/WebSocket applications directly. Deploy the GitHub repository as a Node service, then generate a public domain in the service's Networking settings. The app already listens on `process.env.PORT` and `0.0.0.0`, which is what hosted platforms need.

## Architecture

- `server.js` — Express server, Socket.IO rooms, synchronization, scoring, round timeouts.
- `public/index.html` — UI shell.
- `public/style.css` — game UI.
- `public/game.js` — all eleven minigames and client multiplayer logic.
- `render.yaml` — optional Render deployment configuration.

## Multiplayer notes

- Rooms are currently stored in server memory; no database is required.
- A server restart clears active rooms, which is fine for private friend matches.
- The two players receive the same seed for deterministic challenges such as target locations, key sequences, numbers, and memory patterns.
- Reaction/aim timing is measured locally in the browser, so normal internet latency does not get added directly to the player's reaction score.
- The server validates score ranges and applies a timeout if somebody abandons a round.

## Future upgrades

Good next additions would be accounts, ELO/ranked matchmaking, persistent leaderboards, player profiles, per-test personal bests, match history, spectators, custom playlists, and anti-cheat/server verification for public competition.
