'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteField,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  CollectionReference,
} from 'firebase/firestore';
import { db, OPERATOR_PASSCODE } from '@/lib/firebase';
import {
  MAX_PLAYERS,
  Overlay,
  ParsedCsv,
  SLOT_LETTERS,
  STMT_COLORS,
  Seg2Game,
  screenOrder,
  answersRef,
  bestLiars,
  emptyGame,
  gameRef,
  parseCsv,
  topVoters,
  useGame,
  useRoundVotes,
  votersCol,
  votesCol,
} from '@/lib/game';

const UNLOCK_KEY = 'seg2_operator_unlocked';

export default function OperatorPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setUnlocked(sessionStorage.getItem(UNLOCK_KEY) === '1');
    } catch {
      setUnlocked(false);
    }
  }, []);

  const lock = () => {
    try {
      sessionStorage.removeItem(UNLOCK_KEY);
    } catch {}
    setUnlocked(false);
  };

  if (unlocked === null) return null;
  if (!unlocked) return <Login onUnlock={() => setUnlocked(true)} />;
  return <Panel onLock={lock} />;
}

function Login({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() !== OPERATOR_PASSCODE) return setError('Wrong passcode.');
    try {
      sessionStorage.setItem(UNLOCK_KEY, '1');
    } catch {}
    onUnlock();
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 flex flex-col gap-4">
        <img src="/logo.png" alt="Lie Hard" className="w-24 self-center" />
        <h1 className="font-display text-3xl font-black uppercase text-center">Round 2 Operator</h1>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Operator passcode"
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 outline-none focus:border-amber-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button disabled={!password} className="btn btn-amber">
          Unlock
        </button>
      </form>
    </main>
  );
}

async function deleteAll(col: CollectionReference) {
  // Batched deletes, 400 at a time, until the collection is empty.
  for (;;) {
    const snap = await getDocs(query(col, limit(400)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

function Panel({ onLock }: { onLock: () => void }) {
  const game = useGame();
  const [lies, setLies] = useState<{ [id: string]: number }>({});
  const [joined, setJoined] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  useEffect(
    () =>
      onSnapshot(answersRef, (snap) => setLies((snap.data()?.lie as { [id: string]: number }) ?? {}), (err) =>
        console.error('answers listener', err),
      ),
    [],
  );
  useEffect(() => onSnapshot(votersCol, (snap) => setJoined(snap.size), (err) => console.error('voters listener', err)), []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (game === undefined) return <p className="p-6 text-zinc-400">Loading…</p>;

  return (
    <main className="min-h-screen p-4 lg:p-6 flex flex-col gap-4 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Lie Hard" className="h-10" />
          <h1 className="font-display text-3xl font-black uppercase">Round 2 · Operator</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            Audience joined: <b className="text-white">{joined}</b>
          </span>
          <a href="/display" target="_blank" className="text-amber-400 underline">
            Open display
          </a>
          <button onClick={onLock} className="text-zinc-500 underline">
            Lock
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {!game || !game.players.length ? (
        <CsvUpload game={game} busy={busy} run={run} />
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
          <div className="flex flex-col gap-4">
            <RoundControls game={game} lies={lies} busy={busy} run={run} onEdit={setEditing} />
            <PlayerGrid game={game} busy={busy} run={run} onEdit={setEditing} />
          </div>
          <div className="flex flex-col gap-4">
            <OverlayControls game={game} busy={busy} run={run} />
            <Standings game={game} />
            <CsvUpload game={game} busy={busy} run={run} compact />
            <DangerZone busy={busy} run={run} />
          </div>
        </div>
      )}

      {game && editing !== null && (
        <EditPlayer
          game={game}
          lies={lies}
          playerId={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(edit) =>
            run(async () => {
              await savePlayer(game, lies, editing, edit);
              setEditing(null);
            })
          }
        />
      )}
    </main>
  );
}

type RunFn = (fn: () => Promise<void>) => Promise<void>;

function CsvUpload({ game, busy, run, compact }: { game: Seg2Game | null; busy: boolean; run: RunFn; compact?: boolean }) {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [keepScores, setKeepScores] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setParsed(parseCsv(await file.text()));
  };

  const load = () =>
    run(async () => {
      if (!parsed || parsed.errors.length) return;
      if (game?.players.length && !confirm(`Replace the current ${game.players.length} players? Round progress will be cleared.`)) return;
      await setDoc(answersRef, { lie: parsed.lie });
      await setDoc(gameRef, {
        ...emptyGame(),
        players: parsed.players,
        voterScores: keepScores && game ? game.voterScores : {},
      });
      setParsed(null);
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
    });

  return (
    <section className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold uppercase">{compact ? 'Replace players' : 'Load players'}</h2>
        <a href="/segment2_sample.csv" download className="text-sm text-amber-400 underline">
          Sample CSV
        </a>
      </div>
      {!compact && (
        <p className="text-sm text-zinc-400">
          One row per player, up to {MAX_PLAYERS}. Columns: <code className="text-amber-300">player_name, truth_1, truth_2, lie</code>.
          The three statements are shuffled on load, so the lie isn’t always in the same spot.
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        className="text-sm file:btn file:btn-ghost file:mr-3 file:border-0"
      />
      {parsed && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <b>{fileName}</b>: {parsed.players.length} player{parsed.players.length !== 1 ? 's' : ''}
          </p>
          {parsed.errors.length > 0 ? (
            <ul className="text-sm text-red-400 list-disc pl-5 max-h-40 overflow-auto">
              {parsed.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            <div className="max-h-48 overflow-auto rounded-lg border border-zinc-800 text-sm">
              {parsed.players.slice(0, 100).map((p) => (
                <div key={p.id} className="px-3 py-1.5 border-b border-zinc-900 last:border-0">
                  <b>{p.name}</b>{' '}
                  <span className="text-zinc-500">
                    — lie: {p.statements[parsed.lie[p.id]]}
                  </span>
                </div>
              ))}
            </div>
          )}
          {game && Object.keys(game.voterScores).length > 0 && (
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={keepScores} onChange={(e) => setKeepScores(e.target.checked)} />
              Keep audience scores
            </label>
          )}
          <button onClick={load} disabled={busy || parsed.errors.length > 0} className="btn btn-amber">
            Load {parsed.players.length} players
          </button>
        </div>
      )}
    </section>
  );
}

function RoundControls({
  game,
  lies,
  busy,
  run,
  onEdit,
}: {
  game: Seg2Game;
  lies: { [id: string]: number };
  busy: boolean;
  run: RunFn;
  onEdit: (id: number) => void;
}) {
  const player = game.players.find((p) => p.id === game.currentId);
  const live = useRoundVotes(game.roundKey);
  const lieIndex = player ? lies[player.id] : undefined;

  if (!player || !game.roundKey) {
    const next = game.players.find((p) => !game.done[p.id]);
    return (
      <section className="card p-5 flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold uppercase">Current round</h2>
        <p className="text-zinc-400">No player on stage. Pick one from the list below.</p>
        {next && (
          <button disabled={busy} onClick={() => run(() => selectPlayer(game, next.id))} className="btn btn-amber self-start">
            Start next: {next.name}
          </button>
        )}
      </section>
    );
  }

  const toggleShown = (i: number) =>
    run(() =>
      updateDoc(gameRef, {
        shown: game.shown.includes(i) ? game.shown.filter((x) => x !== i) : [...game.shown, i],
      }),
    );

  const reveal = () =>
    run(async () => {
      if (game.result || lieIndex === undefined || !game.roundKey) return;
      await updateDoc(gameRef, { votingOpen: false });
      const snap = await getDocs(query(votesCol, where('roundKey', '==', game.roundKey)));
      const counts: [number, number, number] = [0, 0, 0];
      const upd: Record<string, unknown> = {};
      const correctIds: string[] = [];
      snap.docs.forEach((d) => {
        const v = d.data() as { clientId: string; name: string; choice: number };
        if (v.choice < 0 || v.choice > 2 || !/^v[a-z0-9]+$/.test(v.clientId)) return;
        counts[v.choice]++;
        if (v.choice === lieIndex) {
          correctIds.push(v.clientId);
          upd[`voterScores.${v.clientId}.name`] = v.name;
          upd[`voterScores.${v.clientId}.correct`] = increment(1);
        }
      });
      const total = counts[0] + counts[1] + counts[2];
      await updateDoc(gameRef, {
        ...upd,
        result: { lieIndex, counts, total, correctIds },
        [`done.${player.id}`]: { lieIndex, fooled: total - counts[lieIndex], total, roundKey: game.roundKey, correctIds },
        shown: screenOrder(game.shown),
      });
    });

  const undoReveal = () =>
    run(async () => {
      if (!game.result || !confirm('Undo the reveal? Audience points from this round are taken back.')) return;
      const ids = game.result.correctIds ?? [];
      const upd: Record<string, unknown> = {};
      ids.forEach((id) => (upd[`voterScores.${id}.correct`] = increment(-1)));
      await updateDoc(gameRef, { ...upd, result: null, [`done.${player.id}`]: deleteField() });
    });

  const nextPlayer = game.players.find((p) => !game.done[p.id] && p.id !== player.id);

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">On stage</p>
          <div className="flex items-center gap-3">
            <p className="font-display text-4xl font-black leading-none">{player.name}</p>
            <button disabled={busy} onClick={() => onEdit(player.id)} className="btn btn-ghost text-xs py-1">
              Edit
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-black">{game.result ? game.result.total : live.total}</p>
          <p className="text-xs uppercase tracking-widest text-zinc-500">votes</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {player.statements.map((s, i) => {
          const isLie = lieIndex === i;
          const shown = game.shown.includes(i) || game.votingOpen || !!game.result;
          const screenNo = shown ? screenOrder(game.shown).indexOf(i) + 1 : null;
          const count = game.result ? game.result.counts[i] : live.counts[i];
          return (
            <div
              key={i}
              className="rounded-xl p-3 flex flex-col gap-2"
              style={{ border: `2px solid ${isLie ? '#dc2626' : '#27272a'}`, background: isLie ? 'rgba(220,38,38,0.08)' : '#0b0b0d' }}
            >
              <div className="flex items-center justify-between">
                <span className="font-display uppercase tracking-widest text-sm" style={{ color: '#a1a1aa' }}>
                  {SLOT_LETTERS[i]}
                  {screenNo && <span style={{ color: STMT_COLORS[screenNo - 1] }}> · Screen #{screenNo}</span>}
                </span>
                <span className={`text-xs font-bold ${isLie ? 'text-red-400' : 'text-green-400'}`}>{isLie ? 'LIE' : 'TRUTH'}</span>
              </div>
              <p className="text-sm leading-snug flex-1">{s}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">{count} votes</span>
                <button
                  disabled={busy || game.votingOpen || !!game.result}
                  onClick={() => toggleShown(i)}
                  className={`btn text-xs py-1 ${shown ? 'btn-amber' : 'btn-ghost'}`}
                >
                  {shown ? 'On screen' : 'Show'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {!game.result && !game.votingOpen && (
          <button disabled={busy} onClick={() => run(() => updateDoc(gameRef, { votingOpen: true, shown: screenOrder(game.shown) }))} className="btn btn-green">
            Open voting
          </button>
        )}
        {!game.result && game.votingOpen && (
          <button disabled={busy} onClick={() => run(() => updateDoc(gameRef, { votingOpen: false }))} className="btn btn-red">
            Close voting
          </button>
        )}
        {!game.result && (
          <button disabled={busy || lieIndex === undefined} onClick={reveal} className="btn btn-amber">
            Reveal lie
          </button>
        )}
        {game.result && (
          <button disabled={busy} onClick={undoReveal} className="btn btn-ghost">
            Undo reveal
          </button>
        )}
        <label className="btn btn-ghost flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={game.showVoteBars}
            disabled={busy}
            onChange={(e) => run(() => updateDoc(gameRef, { showVoteBars: e.target.checked }))}
          />
          Live vote bars on display
        </label>
        <div className="flex-1" />
        <button
          disabled={busy}
          onClick={() => run(() => updateDoc(gameRef, { currentId: null, roundKey: null, votingOpen: false, result: null, shown: [] }))}
          className="btn btn-ghost"
        >
          Clear stage
        </button>
        {nextPlayer && (
          <button disabled={busy || game.votingOpen} onClick={() => run(() => selectPlayer(game, nextPlayer.id))} className="btn btn-amber">
            Next: {nextPlayer.name} →
          </button>
        )}
      </div>
      {lieIndex === undefined && <p className="text-sm text-red-400">No answer stored for this player — re-upload the CSV.</p>}
    </section>
  );
}

async function selectPlayer(game: Seg2Game, id: number) {
  if (game.votingOpen && !confirm('Voting is still open for the current player. Switch anyway?')) return;
  if (game.done[id] && !confirm('This player was already revealed. Playing again will award audience points a second time. Continue?')) return;
  await updateDoc(gameRef, {
    currentId: id,
    roundKey: `${id}-${Date.now().toString(36)}`,
    shown: [],
    votingOpen: false,
    showVoteBars: false,
    result: null,
    overlay: 'none',
  });
}

interface PlayerEdit {
  name: string;
  statements: [string, string, string];
  lieIndex: number;
}

async function savePlayer(game: Seg2Game, lies: { [id: string]: number }, target: number | 'new', edit: PlayerEdit) {
  const id = target === 'new' ? Math.max(0, ...game.players.map((p) => p.id)) + 1 : target;
  const player = { id, name: edit.name, statements: edit.statements };
  const players = target === 'new' ? [...game.players, player] : game.players.map((p) => (p.id === id ? player : p));
  const upd: Record<string, unknown> = { players };

  const d = game.done[id];
  if (d && lies[id] !== edit.lieIndex) {
    if (!d.roundKey) throw new Error('This round was revealed before score recalculation existed — undo the reveal and reveal again instead.');
    // Re-tally the already-revealed round against the new lie.
    const snap = await getDocs(query(votesCol, where('roundKey', '==', d.roundKey)));
    const counts: [number, number, number] = [0, 0, 0];
    const correctIds: string[] = [];
    (d.correctIds ?? []).forEach((cid) => (upd[`voterScores.${cid}.correct`] = increment(-1)));
    snap.docs.forEach((vd) => {
      const v = vd.data() as { clientId: string; name: string; choice: number };
      if (v.choice < 0 || v.choice > 2 || !/^v[a-z0-9]+$/.test(v.clientId)) return;
      counts[v.choice]++;
      if (v.choice === edit.lieIndex) {
        correctIds.push(v.clientId);
        upd[`voterScores.${v.clientId}.name`] = v.name;
        upd[`voterScores.${v.clientId}.correct`] = increment(1);
      }
    });
    const total = counts[0] + counts[1] + counts[2];
    upd[`done.${id}`] = { lieIndex: edit.lieIndex, fooled: total - counts[edit.lieIndex], total, roundKey: d.roundKey, correctIds };
    if (game.currentId === id && game.result && game.roundKey === d.roundKey) {
      upd.result = { lieIndex: edit.lieIndex, counts, total, correctIds };
    }
  }

  await setDoc(answersRef, { lie: { [id]: edit.lieIndex } }, { merge: true });
  await updateDoc(gameRef, upd);
}

function EditPlayer({
  game,
  lies,
  playerId,
  busy,
  onClose,
  onSave,
}: {
  game: Seg2Game;
  lies: { [id: string]: number };
  playerId: number | 'new';
  busy: boolean;
  onClose: () => void;
  onSave: (edit: PlayerEdit) => void;
}) {
  const existing = playerId === 'new' ? null : game.players.find((p) => p.id === playerId);
  const [name, setName] = useState(existing?.name ?? '');
  const [statements, setStatements] = useState<[string, string, string]>(existing ? [...existing.statements] : ['', '', '']);
  const [lieIndex, setLieIndex] = useState<number>(existing ? (lies[existing.id] ?? 0) : 0);

  const revealed = !!existing && !!game.done[existing.id];
  const lieChanged = !!existing && lies[existing.id] !== lieIndex;
  const valid = !!name.trim() && statements.every((s) => s.trim());

  const save = () => {
    if (!valid) return;
    if (revealed && lieChanged && !confirm('This player was already revealed. Changing the lie will recalculate audience scores for their round. Continue?')) return;
    onSave({
      name: name.trim(),
      statements: statements.map((s) => s.trim()) as [string, string, string],
      lieIndex,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold uppercase">{existing ? 'Edit player' : 'Add player'}</h2>
          {existing?.id === game.currentId && <span className="text-xs text-amber-400">On stage — changes show live</span>}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none focus:border-amber-500"
          />
        </label>
        {statements.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-display uppercase tracking-widest" style={{ color: '#a1a1aa' }}>
                Statement {SLOT_LETTERS[i]}
              </span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="lie" checked={lieIndex === i} onChange={() => setLieIndex(i)} />
                <span className={lieIndex === i ? 'text-red-400 font-semibold' : 'text-zinc-500'}>
                  {lieIndex === i ? 'LIE' : 'Mark as lie'}
                </span>
              </label>
            </div>
            <textarea
              value={s}
              rows={2}
              onChange={(e) => setStatements((prev) => prev.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string])}
              className="rounded-lg bg-zinc-900 px-3 py-2 outline-none border"
              style={{ borderColor: lieIndex === i ? '#dc2626' : '#3f3f46' }}
            />
          </div>
        ))}
        {revealed && lieChanged && (
          <p className="text-sm text-amber-400">Already revealed — saving will recalculate audience scores for this round.</p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button disabled={busy || !valid} onClick={save} className="btn btn-amber">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerGrid({ game, busy, run, onEdit }: { game: Seg2Game; busy: boolean; run: RunFn; onEdit: (id: number | 'new') => void }) {
  const [search, setSearch] = useState('');
  const doneCount = Object.keys(game.done).length;
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? game.players.filter((p) => p.name.toLowerCase().includes(q)) : game.players;
  }, [game.players, search]);

  return (
    <section className="card p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold uppercase">
          Players <span className="text-zinc-500">{doneCount}/{game.players.length} done</span>
        </h2>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name…"
            className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm outline-none focus:border-amber-500"
          />
          <button disabled={busy || game.players.length >= MAX_PLAYERS} onClick={() => onEdit('new')} className="btn btn-ghost text-sm py-1.5">
            + Add player
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 max-h-[420px] overflow-auto pr-1">
        {list.map((p) => {
          const d = game.done[p.id];
          const current = p.id === game.currentId;
          return (
            <div
              key={p.id}
              className="relative rounded-lg border transition-colors"
              style={{
                borderColor: current ? '#f59e0b' : d ? '#14532d' : '#27272a',
                background: current ? 'rgba(245,158,11,0.15)' : d ? 'rgba(20,83,45,0.2)' : '#0b0b0d',
              }}
            >
              <button
                disabled={busy || current}
                onClick={() => run(() => selectPlayer(game, p.id))}
                className="w-full text-left px-3 py-2 pr-12"
              >
                <p className="text-sm font-semibold truncate">
                  <span className="text-zinc-500 mr-1">{p.id}.</span>
                  {p.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {current ? 'On stage' : d ? `Fooled ${d.total ? Math.round((d.fooled / d.total) * 100) : 0}%` : 'Not played'}
                </p>
              </button>
              <button
                disabled={busy}
                onClick={() => onEdit(p.id)}
                className="absolute top-1.5 right-1.5 text-xs text-zinc-400 hover:text-amber-400 px-1.5 py-0.5 rounded bg-zinc-900"
              >
                Edit
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OverlayControls({ game, busy, run }: { game: Seg2Game; busy: boolean; run: RunFn }) {
  const opts: { v: Overlay; label: string }[] = [
    { v: 'none', label: 'None' },
    { v: 'join', label: 'Join QR' },
    { v: 'voters', label: 'Top spotters' },
    { v: 'liars', label: 'Best liars' },
  ];
  return (
    <section className="card p-4 flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold uppercase">Display overlay</h2>
      <div className="grid grid-cols-2 gap-2">
        {opts.map((o) => (
          <button
            key={o.v}
            disabled={busy}
            onClick={() => run(() => updateDoc(gameRef, { overlay: o.v }))}
            className={`btn ${game.overlay === o.v ? 'btn-amber' : 'btn-ghost'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">With no player on stage, the display shows the join QR by default.</p>
    </section>
  );
}

function Standings({ game }: { game: Seg2Game }) {
  const voters = topVoters(game, 10);
  const liars = bestLiars(game, 5);
  return (
    <section className="card p-4 flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold uppercase">Top spotters</h2>
      {voters.length ? (
        <ol className="text-sm flex flex-col gap-1">
          {voters.map((v, i) => (
            <li key={v.id} className="flex justify-between">
              <span>
                <span className="text-zinc-500 mr-2">{i + 1}.</span>
                {v.name}
              </span>
              <b>{v.correct}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-zinc-500">No correct votes yet.</p>
      )}
      <h2 className="font-display text-xl font-bold uppercase mt-2">Best liars</h2>
      {liars.length ? (
        <ol className="text-sm flex flex-col gap-1">
          {liars.map((p, i) => (
            <li key={p.id} className="flex justify-between">
              <span>
                <span className="text-zinc-500 mr-2">{i + 1}.</span>
                {p.name}
              </span>
              <b>
                {p.pct}% <span className="text-zinc-500 font-normal">({p.fooled}/{p.total})</span>
              </b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-zinc-500">No rounds revealed yet.</p>
      )}
    </section>
  );
}

function DangerZone({ busy, run }: { busy: boolean; run: RunFn }) {
  return (
    <section className="card p-4 flex flex-col gap-2" style={{ borderColor: 'rgba(220,38,38,0.35)' }}>
      <h2 className="font-display text-xl font-bold uppercase text-red-400">Reset</h2>
      <button
        disabled={busy}
        onClick={() =>
          run(async () => {
            if (!confirm('Reset all audience scores to zero?')) return;
            await updateDoc(gameRef, { voterScores: {} });
          })
        }
        className="btn btn-ghost"
      >
        Reset audience scores
      </button>
      <button
        disabled={busy}
        onClick={() =>
          run(async () => {
            if (!confirm('Start a new show? This deletes all players, votes, audience names and scores.')) return;
            await deleteAll(votesCol);
            await deleteAll(votersCol);
            await setDoc(answersRef, { lie: {} });
            await setDoc(gameRef, emptyGame());
          })
        }
        className="btn btn-red"
      >
        New show (wipe everything)
      </button>
    </section>
  );
}
