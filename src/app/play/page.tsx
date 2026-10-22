'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STMT_COLORS, Seg2Vote, screenOrder, useGame, voteId, votersCol } from '@/lib/game';

const CID_KEY = 'seg2_client';
const NAME_KEY = 'seg2_name';

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function getClientId() {
  let id = safeGet(CID_KEY);
  if (!id || !/^v[a-z0-9]{8,}$/.test(id)) {
    id = 'v' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    safeSet(CID_KEY, id);
  }
  return id;
}

export default function PlayPage() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setClientId(getClientId());
    setName(safeGet(NAME_KEY));
  }, []);

  if (!clientId) return null;
  if (!name) return <JoinForm clientId={clientId} onJoined={setName} />;
  return <Playing clientId={clientId} name={name} onRename={() => setName(null)} />;
}

function JoinForm({ clientId, onJoined }: { clientId: string; onJoined: (n: string) => void }) {
  const [value, setValue] = useState(safeGet(NAME_KEY) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = value.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!n) return setError('Please enter your name.');
    setBusy(true);
    setError('');
    try {
      await setDoc(doc(votersCol, clientId), { name: n, joinedAt: Date.now() });
      safeSet(NAME_KEY, n);
      onJoined(n);
    } catch (err) {
      console.error(err);
      setError('Could not join — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10">
      <img src="/logo.png" alt="Lie Hard" className="w-32 mb-6" />
      <h1 className="font-display text-4xl font-black uppercase text-center leading-none">
        Spot the <span style={{ color: 'var(--amber)' }}>Lie</span>
      </h1>
      <p className="text-zinc-400 text-center mt-3 max-w-xs">
        Each player tells you three things. Two are true. Pick the lie.
      </p>
      <form onSubmit={submit} className="w-full max-w-sm mt-8 flex flex-col gap-3">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={30}
          placeholder="Your name"
          className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-4 text-lg outline-none focus:border-amber-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button disabled={busy} className="btn btn-amber py-4 text-lg font-display uppercase tracking-wider">
          {busy ? 'Joining…' : 'Play along'}
        </button>
      </form>
    </main>
  );
}

function Playing({ clientId, name, onRename }: { clientId: string; name: string; onRename: () => void }) {
  const game = useGame();
  const [myVote, setMyVote] = useState<Seg2Vote | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [error, setError] = useState('');

  const roundKey = game?.roundKey ?? null;

  useEffect(() => {
    setMyVote(null);
    setError('');
    if (!roundKey) return;
    return onSnapshot(doc(db, 'seg2Votes', voteId(roundKey, clientId)), (snap) =>
      setMyVote(snap.exists() ? (snap.data() as Seg2Vote) : null),
    );
  }, [roundKey, clientId]);

  const { score, rank } = useMemo(() => {
    if (!game) return { score: 0, rank: null as number | null };
    const mine = game.voterScores[clientId]?.correct ?? 0;
    if (!mine) return { score: 0, rank: null };
    const ahead = Object.values(game.voterScores).filter((v) => v.correct > mine).length;
    return { score: mine, rank: ahead + 1 };
  }, [game, clientId]);

  const vote = async (choice: number) => {
    if (!game || !roundKey || !game.votingOpen) return;
    setSending(choice);
    setError('');
    try {
      await setDoc(doc(db, 'seg2Votes', voteId(roundKey, clientId)), {
        clientId,
        name,
        roundKey,
        choice,
        ts: Date.now(),
      });
    } catch (err) {
      console.error(err);
      setError('Vote not counted — voting may have just closed.');
    } finally {
      setSending(null);
    }
  };

  const player = game?.players.find((p) => p.id === game.currentId);
  const result = game?.result ?? null;

  let body: React.ReactNode;
  if (game === undefined) {
    body = <Waiting label="Connecting…" />;
  } else if (!game || !player || !roundKey) {
    body = <Waiting label="Waiting for the next player…" />;
  } else {
    const chosen = myVote?.choice ?? null;
    const statusLine = result
      ? chosen === null
        ? 'You didn’t vote this round'
        : chosen === result.lieIndex
          ? 'You spotted the lie!'
          : 'Fooled you!'
      : game.votingOpen
        ? chosen === null
          ? 'Which one is the LIE?'
          : 'Vote locked in — tap another to change'
        : chosen === null
          ? 'Get ready to vote…'
          : 'Votes are closed';
    const statusColor = result
      ? chosen !== null && chosen === result.lieIndex
        ? '#4ade80'
        : '#f87171'
      : 'var(--amber)';

    body = (
      <div className="w-full max-w-md flex flex-col gap-4 animate-fade-in" key={roundKey}>
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Now playing</p>
          <p className="font-display text-4xl font-black leading-tight">{player.name}</p>
        </div>
        <p
          className={`font-display text-2xl font-bold text-center uppercase ${result ? 'animate-reveal-pop' : ''}`}
          style={{ color: statusColor }}
        >
          {statusLine}
        </p>
        <div className="flex flex-col gap-3">
          {screenOrder(game.shown).map((i, slot) => {
            const text = player.statements[i];
            const visible = game.votingOpen || !!result || game.shown.includes(i);
            const isChosen = chosen === i;
            const isLie = result?.lieIndex === i;
            let border = 'rgba(245,158,11,0.2)';
            let bg = 'var(--card)';
            if (result) {
              if (isLie) {
                border = '#f87171';
                bg = 'rgba(248,113,113,0.12)';
              } else if (isChosen) {
                border = '#71717a';
                bg = 'rgba(113,113,122,0.12)';
              }
            } else if (isChosen) {
              border = STMT_COLORS[slot];
              bg = 'rgba(245,158,11,0.12)';
            }
            return (
              <button
                key={i}
                disabled={!game.votingOpen || !!result || sending !== null}
                onClick={() => vote(i)}
                className="text-left rounded-2xl px-4 py-4 transition-colors disabled:cursor-default"
                style={{ border: `2px solid ${border}`, background: bg }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="font-display uppercase tracking-widest text-sm"
                    style={{ color: STMT_COLORS[slot] }}
                  >
                    Statement {slot + 1}
                  </span>
                  {result && isLie && <span className="text-red-400 text-sm font-semibold">LIE</span>}
                  {result && !isLie && <span className="text-green-400 text-sm font-semibold">TRUTH</span>}
                  {!result && isChosen && <span className="text-amber-400 text-sm font-semibold">Your pick</span>}
                </div>
                <p className={`text-lg leading-snug ${visible ? 'text-white' : 'text-zinc-600'}`}>
                  {visible ? text : '• • •'}
                </p>
              </button>
            );
          })}
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-900">
        <img src="/logo.png" alt="Lie Hard" className="h-8" />
        <div className="text-right">
          <p className="text-sm font-semibold leading-tight">{name}</p>
          <p className="text-xs text-zinc-400 leading-tight">
            {score} correct{rank ? ` · #${rank}` : ''}
          </p>
        </div>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">{body}</div>
      <footer className="text-center pb-4">
        <button onClick={onRename} className="text-xs text-zinc-600 underline">
          Change name
        </button>
      </footer>
    </main>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <p className="font-display text-2xl uppercase tracking-widest text-zinc-400 animate-breathe text-center">
      {label}
    </p>
  );
}
