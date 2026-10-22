'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { STMT_COLORS, Seg2Game, bestLiars, topVoters, useGame, useRoundVotes } from '@/lib/game';

const AMBER = '#f59e0b';

export default function DisplayPage() {
  const game = useGame();
  const [joinUrl, setJoinUrl] = useState('');
  const [qr, setQr] = useState('');

  useEffect(() => {
    const url = `${window.location.origin}/play`;
    setJoinUrl(url);
    QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(console.error);
  }, []);

  const player = game?.players.find((p) => p.id === game.currentId);

  return (
    <main className="w-screen h-screen overflow-hidden relative" style={{ background: '#08080a' }}>
      {game && player && game.roundKey ? (
        <RoundScreen game={game} />
      ) : (
        <IdleScreen joinUrl={joinUrl} qr={qr} />
      )}
      {game?.overlay === 'join' && player && <JoinOverlay joinUrl={joinUrl} qr={qr} />}
      {game?.overlay === 'voters' && <VotersOverlay game={game} />}
      {game?.overlay === 'liars' && <LiarsOverlay game={game} />}
    </main>
  );
}

function IdleScreen({ joinUrl, qr }: { joinUrl: string; qr: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ gap: '6vw', padding: '4vw' }}>
      <div className="flex flex-col items-start" style={{ gap: '1.5vw' }}>
        <img src="/logo.png" alt="Lie Hard" style={{ width: '14vw' }} />
        <p className="font-display font-black uppercase leading-none" style={{ fontSize: '7vw' }}>
          Round 2
        </p>
        <p className="font-display font-bold uppercase leading-none" style={{ fontSize: '3.4vw', color: AMBER }}>
          Two lies. One truth.
        </p>
        <p className="text-zinc-400" style={{ fontSize: '1.6vw', maxWidth: '38vw' }}>
          Scan to play along — just enter your name. Spot the truth to climb the leaderboard.
        </p>
      </div>
      <QrCard joinUrl={joinUrl} qr={qr} size="26vw" />
    </div>
  );
}

function QrCard({ joinUrl, qr, size }: { joinUrl: string; qr: string; size: string }) {
  return (
    <div className="flex flex-col items-center" style={{ gap: '1vw' }}>
      <div className="rounded-3xl bg-white" style={{ padding: '1.2vw' }}>
        {qr ? <img src={qr} alt="Join QR code" style={{ width: size, height: size }} /> : <div style={{ width: size, height: size }} />}
      </div>
      <p className="font-display font-bold tracking-wide" style={{ fontSize: '1.8vw', color: AMBER }}>
        {joinUrl.replace(/^https?:\/\//, '')}
      </p>
    </div>
  );
}

function RoundScreen({ game }: { game: Seg2Game }) {
  const player = game.players.find((p) => p.id === game.currentId)!;
  const live = useRoundVotes(game.result ? null : game.roundKey);
  const result = game.result;
  const counts = result ? result.counts : live.counts;
  const total = result ? result.total : live.total;
  const showBars = game.showVoteBars || !!result;

  return (
    <div className="w-full h-full flex flex-col" style={{ padding: '3vw 4vw', gap: '2vw' }}>
      {/* Header: player + status */}
      <div className="flex items-end justify-between" style={{ gap: '2vw' }}>
        <div>
          <p className="uppercase text-zinc-500" style={{ fontSize: '1.2vw', letterSpacing: '0.4em' }}>
            Round 2 · Spot the truth
          </p>
          <p className="font-display font-black leading-none" style={{ fontSize: '6vw' }}>
            {player.name}
          </p>
        </div>
        <div className="text-right">
          {result ? (
            <p
              className="font-display font-black uppercase animate-reveal-pop leading-none"
              style={{ fontSize: '4.4vw', color: '#4ade80', textShadow: '0 0 4vw rgba(74,222,128,0.45)' }}
            >
              Statement {result.truthIndex + 1} is the truth
            </p>
          ) : game.votingOpen ? (
            <>
              <p className="font-display font-black uppercase animate-breathe" style={{ fontSize: '4vw', color: AMBER }}>
                Vote now
              </p>
              <p className="font-display text-zinc-300" style={{ fontSize: '2vw' }}>
                {total} vote{total !== 1 ? 's' : ''}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* Statements */}
      <div className="flex-1 min-h-0 grid grid-cols-3" style={{ gap: '1.5vw' }}>
        {player.statements.map((text, i) => {
          const visible = game.votingOpen || !!result || game.shown.includes(i);
          const isTruth = result?.truthIndex === i;
          const color = result ? (isTruth ? '#4ade80' : '#f87171') : STMT_COLORS[i];
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          return (
            <div
              key={i}
              className="rounded-3xl flex flex-col animate-fade-in"
              style={{
                padding: '2vw',
                background: result && isTruth ? 'rgba(74,222,128,0.1)' : '#0d0d0f',
                border: `0.2vw solid ${result ? color : visible ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.12)'}`,
                opacity: result && !isTruth ? 0.6 : 1,
              }}
            >
              <div className="flex items-center justify-between">
                <p className="font-display uppercase tracking-widest" style={{ fontSize: '1.6vw', color: STMT_COLORS[i] }}>
                  Statement {i + 1}
                </p>
                {result && (
                  <p className="font-display font-black uppercase animate-reveal-pop" style={{ fontSize: '2.2vw', color }}>
                    {isTruth ? 'Truth' : 'Lie'}
                  </p>
                )}
              </div>
              <div className="flex-1 flex items-center">
                {visible ? (
                  <p className="font-semibold text-white leading-snug" style={{ fontSize: text.length > 90 ? '2vw' : '2.6vw' }}>
                    {text}
                  </p>
                ) : (
                  <p className="font-display text-zinc-700 uppercase tracking-widest" style={{ fontSize: '2vw' }}>
                    Hidden
                  </p>
                )}
              </div>
              {showBars && (
                <div>
                  <div className="flex justify-between font-display" style={{ fontSize: '1.6vw' }}>
                    <span className="text-zinc-400">{counts[i]} votes</span>
                    <span style={{ color }}>{pct}%</span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: '1vw', background: '#18181b' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {result && result.total > 0 && (
        <p className="font-display text-center animate-fade-in" style={{ fontSize: '2.4vw' }}>
          <span style={{ color: AMBER }}>{player.name}</span> fooled{' '}
          <span className="font-black">{result.total - result.counts[result.truthIndex]}</span> of {result.total} (
          {Math.round(((result.total - result.counts[result.truthIndex]) / result.total) * 100)}%)
        </p>
      )}
    </div>
  );
}

function OverlayShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center animate-fade-in"
      style={{ background: 'rgba(8,8,10,0.96)', padding: '3vw', gap: '2vw' }}
    >
      <p className="font-display font-black uppercase" style={{ fontSize: '4.5vw', color: AMBER }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function JoinOverlay({ joinUrl, qr }: { joinUrl: string; qr: string }) {
  return (
    <OverlayShell title="Scan to play along">
      <QrCard joinUrl={joinUrl} qr={qr} size="28vw" />
    </OverlayShell>
  );
}

function Leaderboard({ rows }: { rows: { key: string; name: string; value: string; sub?: string }[] }) {
  if (!rows.length)
    return <p className="font-display text-zinc-500 uppercase tracking-widest" style={{ fontSize: '2vw' }}>No scores yet</p>;
  const cols = rows.length > 5 ? 2 : 1;
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '1vw 3vw', width: cols === 2 ? '80vw' : '45vw' }}>
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center rounded-2xl" style={{ background: '#0d0d0f', border: '1px solid rgba(245,158,11,0.2)', padding: '1vw 1.5vw', gap: '1.5vw' }}>
          <p className="font-display font-black" style={{ fontSize: '2.6vw', color: i < 3 ? AMBER : '#71717a', width: '3.5vw' }}>
            {i + 1}
          </p>
          <p className="font-display font-bold flex-1 truncate" style={{ fontSize: '2.4vw' }}>
            {r.name}
          </p>
          <div className="text-right">
            <p className="font-display font-black" style={{ fontSize: '2.4vw' }}>{r.value}</p>
            {r.sub && <p className="text-zinc-500" style={{ fontSize: '1vw' }}>{r.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function VotersOverlay({ game }: { game: Seg2Game }) {
  const rows = topVoters(game, 10).map((v) => ({ key: v.id, name: v.name, value: String(v.correct), sub: 'correct' }));
  return (
    <OverlayShell title="Top truth spotters">
      <Leaderboard rows={rows} />
    </OverlayShell>
  );
}

function LiarsOverlay({ game }: { game: Seg2Game }) {
  const rows = bestLiars(game, 10).map((p) => ({ key: String(p.id), name: p.name, value: `${p.pct}%`, sub: `fooled ${p.fooled}/${p.total}` }));
  return (
    <OverlayShell title="Best liars">
      <Leaderboard rows={rows} />
    </OverlayShell>
  );
}
