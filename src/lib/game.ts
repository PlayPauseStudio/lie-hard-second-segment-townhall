'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import Papa from 'papaparse';
import { db } from './firebase';

// ── Firestore layout ────────────────────────────────────────────────────────
// seg2Game/live          public game state (operator writes, everyone reads)
// seg2Private/answers    which statement is the lie, per player (operator only)
// seg2Voters/{clientId}  audience join record: { name, joinedAt }
// seg2Votes/{roundKey}_{clientId}  one vote per phone per round
// See web/firestore.rules in the lie-hard-live repo (same Firebase project).

export const MAX_PLAYERS = 100;

export interface Seg2Player {
  id: number;
  name: string;
  statements: [string, string, string]; // already shuffled; lie position is private
}

export interface RoundResult {
  lieIndex: number;
  counts: [number, number, number];
  total: number;
  correctIds?: string[]; // voters awarded a point — lets the operator undo a reveal
}

export interface DoneRecord {
  lieIndex: number;
  fooled: number;
  total: number;
  roundKey?: string; // lets a lie edit after reveal re-tally that round
  correctIds?: string[];
}

export type Overlay = 'none' | 'join' | 'voters' | 'liars';

export interface Seg2Game {
  players: Seg2Player[];
  currentId: number | null;
  roundKey: string | null;
  shown: number[]; // statement indices visible on the display
  votingOpen: boolean;
  showVoteBars: boolean;
  result: RoundResult | null;
  done: { [playerId: string]: DoneRecord };
  voterScores: { [clientId: string]: { name: string; correct: number } };
  overlay: Overlay;
}

export interface Seg2Vote {
  clientId: string;
  name: string;
  roundKey: string;
  choice: number;
  ts: number;
}

export const gameRef = doc(db, 'seg2Game', 'live');
export const answersRef = doc(db, 'seg2Private', 'answers');
export const votesCol = collection(db, 'seg2Votes');
export const votersCol = collection(db, 'seg2Voters');
export const voteId = (roundKey: string, clientId: string) => `${roundKey}_${clientId}`;

export function emptyGame(): Seg2Game {
  return {
    players: [],
    currentId: null,
    roundKey: null,
    shown: [],
    votingOpen: false,
    showVoteBars: false,
    result: null,
    done: {},
    voterScores: {},
    overlay: 'join',
  };
}

/** Live game state. `undefined` while loading, `null` if the doc doesn't exist yet. */
export function useGame(): Seg2Game | null | undefined {
  const [game, setGame] = useState<Seg2Game | null | undefined>(undefined);
  useEffect(
    () =>
      onSnapshot(
        gameRef,
        (snap) => setGame(snap.exists() ? { ...emptyGame(), ...(snap.data() as Seg2Game) } : null),
        (err) => {
          console.error('game listener', err);
          setGame(null);
        },
      ),
    [],
  );
  return game;
}

/** Live vote tally for one round. */
export function useRoundVotes(roundKey: string | null) {
  const [votes, setVotes] = useState<Seg2Vote[]>([]);
  useEffect(() => {
    setVotes([]);
    if (!roundKey) return;
    return onSnapshot(query(votesCol, where('roundKey', '==', roundKey)), (snap) =>
      setVotes(snap.docs.map((d) => d.data() as Seg2Vote)),
    );
  }, [roundKey]);
  const counts: [number, number, number] = [0, 0, 0];
  for (const v of votes) if (v.choice >= 0 && v.choice <= 2) counts[v.choice]++;
  return { counts, total: votes.length };
}

export function topVoters(game: Seg2Game, n = 10) {
  return Object.entries(game.voterScores)
    .map(([id, v]) => ({ id, ...v }))
    .filter((v) => v.correct > 0)
    .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function bestLiars(game: Seg2Game, n = 10) {
  return game.players
    .filter((p) => game.done[p.id] && game.done[p.id].total > 0)
    .map((p) => {
      const d = game.done[p.id];
      return { ...p, fooled: d.fooled, total: d.total, pct: Math.round((d.fooled / d.total) * 100) };
    })
    .sort((a, b) => b.pct - a.pct || b.fooled - a.fooled)
    .slice(0, n);
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// Columns: player_name, truth_1, truth_2, lie (header names are case-insensitive;
// "name", "truth1", "truth2" also accepted). Lines starting with # are ignored.

export interface ParsedCsv {
  players: Seg2Player[];
  lie: { [playerId: string]: number };
  errors: string[];
}

const pick = (row: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (row[k] != null && row[k].trim() !== '') return row[k].trim();
  return '';
};

export function parseCsv(text: string): ParsedCsv {
  const cleaned = text
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
  const res = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
  });
  const errors: string[] = [];
  const players: Seg2Player[] = [];
  const lie: { [id: string]: number } = {};

  res.data.forEach((row, i) => {
    const line = i + 2;
    const name = pick(row, 'player_name', 'name', 'player');
    const t1 = pick(row, 'truth_1', 'truth1');
    const t2 = pick(row, 'truth_2', 'truth2');
    const l = pick(row, 'lie');
    if (!name || !t1 || !t2 || !l) {
      errors.push(`Row ${line}: needs player_name, truth_1, truth_2 and lie.`);
      return;
    }
    // Shuffle so the lie isn't always in the same slot.
    const order = [0, 1, 2];
    for (let j = order.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [order[j], order[k]] = [order[k], order[j]];
    }
    const src = [t1, t2, l];
    const id = players.length + 1;
    players.push({ id, name, statements: order.map((o) => src[o]) as [string, string, string] });
    lie[id] = order.indexOf(2);
  });

  if (players.length > MAX_PLAYERS) {
    errors.push(`${players.length} players found — the limit is ${MAX_PLAYERS}.`);
  }
  if (!players.length && !errors.length) errors.push('No players found in the file.');
  return { players, lie, errors };
}

export const STMT_COLORS = ['#fbbf24', '#a78bfa', '#34d399'];
export const SLOT_LETTERS = ['A', 'B', 'C'];

/**
 * On-screen order of a player's statements: revealed ones first, left to right
 * in the order the operator revealed them, then the still-hidden ones. Screen
 * numbering ("Statement 1, 2, 3") follows this order, so it gives nothing away.
 */
export function screenOrder(shown: number[]): number[] {
  const revealed = shown.filter((i, k) => i >= 0 && i <= 2 && shown.indexOf(i) === k);
  return [...revealed, ...[0, 1, 2].filter((i) => !revealed.includes(i))];
}
