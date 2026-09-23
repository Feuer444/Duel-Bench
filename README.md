# DUEL BENCH v3 — Party Skill Battle

A real-time 1v1 browser game where two friends compete in gamer/human benchmark tests. The benchmark gameplay stays clean, while mascots, coins, streaks and reactions make the match feel like a small party game.

## What's new in v3

- 6 selectable handmade CSS mascots: Blob, Bean, Boxy, Puff, Star and Bot
- Mascots stay beside the arena during every test
- Mascot animations for ready/focus, victory, strong performance, defeat and panic
- Speech bubbles and funny reactions based on round outcome
- Match coins: round winner gets 100 coins plus win-streak bonuses
- Visible coin piles grow during the match
- Coin showers + confetti after wins
- Stars remain the actual competitive match score; coins are a fun secondary reward
- Cleaner party-game visual design with less neon/glass/cyber styling
- Reaction Time is now 5 attempts; the average reaction time wins the round
- Reaction result screen shows all five attempts for both players

## Game modes

### ULTIMATE 11
Reaction Time, Sequence Memory, Aim Trainer, Number Memory, Verbal Memory, Chimp Test, Visual Memory, Typing, Tracking, WASD Reflex, Click Burst.

### HUMAN 8
Reaction Time, Sequence Memory, Aim Trainer, Number Memory, Verbal Memory, Chimp Test, Visual Memory, Typing.

### GAMER 5
Reaction Time, Aim Trainer, Tracking, WASD Reflex, Click Burst.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Deploy on Render

The project is already configured for Render with `render.yaml`.

If your existing GitHub repo is already connected to Render:

1. Replace/upload the updated project files in the same GitHub repository.
2. Commit the changes to the `main` branch.
3. Render should automatically start a new deployment.
4. When the deployment says Live, open your existing `.onrender.com` URL.

For a new Render service:

- Type: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`

## Important multiplayer note

Rooms are stored in server memory. This is perfect for the current two-player prototype. If the Render service restarts, active room codes disappear. A database is only needed later if you want persistent profiles, cosmetics, leaderboards or matchmaking.
