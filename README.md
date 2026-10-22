# Lie Hard — Round 2 (Spot the Truth)

Standalone version of Lie Hard's second segment. You can load up to **100 players** from a CSV.
Each player has **1 truth + 2 lies**. The audience plays along on their phones **with just a name**:
no Google or email sign-up.

There is no game server. It's a Next.js frontend (deployed on Vercel) talking straight to Firestore
in the existing **`lie-hard-live`** Firebase project.

| Route       | Who            | What                                                                   |
| ----------- | -------------- | ---------------------------------------------------------------------- |
| `/play`     | Audience       | Enter name → pick the truth for each player → see score + rank        |
| `/display`  | Big screen     | Join QR, the three statements, live vote bars, reveal, leaderboards    |
| `/operator` | Show operator  | Upload CSV, pick player, show statements, open/close voting, reveal   |

## CSV format

```csv
player_name,truth,lie_1,lie_2
Karan,I studied in London for 2 years,I failed my driving test 5 times,I have a twin sister
```

- One row per player, max 100. Lines starting with `#` are ignored.
- The three statements are shuffled on upload, so the truth isn't always in the same slot.
- The operator can download a sample from the panel (`/segment2_sample.csv`).

## Running a round

1. Operator uploads the CSV. The display shows the join QR (`<site>/play`).
2. Pick a player (searchable grid, or **Next →**). Reveal statements one at a time with **Show**.
3. **Open voting**: phones can now pick a statement. Votes can be changed until voting closes.
4. **Reveal truth**: voting closes, the truth lights up, and everyone who picked it gets +1.
   The player's "fooled %" is recorded. **Undo reveal** takes those points back.
5. Overlays: **Top spotters** (audience leaderboard), **Best liars** (players by % fooled), **Join QR**.

## Data (Firestore, project `lie-hard-live`)

- `seg2Game/live`: public game state (players + statements, but no answers until reveal)
- `seg2Private/answers`: which statement is the truth (operator-only)
- `seg2Voters/{clientId}`: audience name; `seg2Votes/{roundKey}_{clientId}`: one vote per phone per round

**Security rules live in the other repo**: `lie-hard-live/web/firestore.rules` (the
`seg2*` block). A Firebase project has a single rules file, so they must stay in that one file.
Deploy them from `lie-hard-live/web` with `npm run deploy:rules:prod` (or `npm run deploy:rules`
here, which runs the same command). Votes are only accepted while voting is open for the current
round. Only the operator account can change game state.

## Setup

1. **Operator account**: in Firebase console → `lie-hard-live` → Authentication → Users → *Add user*:
   `segment2-operator@playgroundcomedy.studio` with a password of your choice. That password is
   what you type on `/operator`. (Email/Password sign-in is already enabled on this project.)
2. **Rules**: deploy as above.
3. **Env**: copy `.env.example` → `.env.local` and fill in the `lie-hard-live` Firebase web config
   (same values as `lie-hard-live/web/.env.production`).
4. `npm install && npm run dev` → http://localhost:3020

## Deploy (Vercel)

Import this repo in Vercel (framework: Next.js, no settings to change), then add the
`NEXT_PUBLIC_*` variables from `.env.example` under Project → Settings → Environment Variables.
No Firebase authorized-domain change is needed: email/password sign-in doesn't check domains.
