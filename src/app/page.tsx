import Link from 'next/link';

export default function Home() {
  const links = [
    { href: '/play', label: 'Play along', sub: 'Audience — join with your name' },
    { href: '/display', label: 'Display', sub: 'Big screen' },
    { href: '/operator', label: 'Operator', sub: 'Control panel' },
  ];
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-12">
      <img src="/logo.png" alt="Lie Hard" className="w-40" />
      <h1 className="font-display text-5xl font-black uppercase tracking-wide text-center">
        Round 2 <span style={{ color: 'var(--amber)' }}>· Spot the Lie</span>
      </h1>
      <div className="grid w-full max-w-md gap-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="card px-5 py-4 hover:border-amber-500">
            <p className="font-display text-2xl font-bold">{l.label}</p>
            <p className="text-sm text-zinc-400">{l.sub}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
