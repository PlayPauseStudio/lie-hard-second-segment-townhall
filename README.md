# Lie Hard — Round 2 (Spot the Truth)

Standalone version of Lie Hard's second segment. You can load up to **100 players** from a CSV.
Each player has **1 truth + 2 lies**. The audience plays along on their phones by **typing their
name**: no sign-up, no Google sign-in.

It's frontend-only (Next.js on Vercel). Votes sync through Firestore in this app's own Firebase
project, **`lie-hard-townhall`**. That project is already set up, and its config is built into the
code, so the app needs no env vars and has nothing to configure.

| Route       | Who            | What                                                                   |
| ----------- | -------------- | ---------------------------------------------------------------------- |
| `/play`     | Audience       | Type name → pick the truth for each player → see score + rank         |
| `/display`  | Big screen     | Join QR, the three statements, live vote bars, reveal, leaderboards    |
| `/operator` | Show operator  | Upload CSV, pick player, show statements, open/close voting, reveal   |

`/operator` passcode: **`liehard2`**. To change it, set `NEXT_PUBLIC_OPERATOR_PASSCODE` on Vercel.

## CSV format

```csv
player_name,truth,lie_1,lie_2
Karan,I studied in London for 2 years,I failed my driving test 5 times,I have a twin sister
```

- One row per player, max 100. Lines starting with `#` are ignored.
- The three statements are shuffled on upload, so the truth isn't always in the same slot.
- Sample: `/segment2_sample.csv` (there's a download link on the operator panel).

## Running a round

1. Operator uploads the CSV. The display shows the join QR (`<site>/play`).
2. Pick a player (searchable grid, or **Next →**). Reveal statements one at a time with **Show**.
3. **Open voting**: phones can now pick a statement, and change it until voting closes.
4. **Reveal truth**: voting closes, the truth lights up, and everyone who picked it gets +1.
   The player's "fooled %" is recorded. **Undo reveal** takes those points back.
5. Overlays: **Top spotters** (audience leaderboard), **Best liars** (players by % fooled), **Join QR**.

## Deploy (Vercel)

Import the repo in Vercel and deploy. It's a Next.js app with no settings to change.

## Local dev

`npm install && npm run dev` → http://localhost:3020

## Firestore

Project `lie-hard-townhall`, used only by this app. Rules are in `firestore.rules`; deploy them
with `npm run deploy:rules`. Votes are only accepted while voting is open for the current player.

- `seg2Game/live`: game state · `seg2Private/answers`: the truth per player
- `seg2Voters/{clientId}`: audience names · `seg2Votes/{roundKey}_{clientId}`: one vote per phone per round
