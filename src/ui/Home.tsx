import type { Library } from './session';

function Forest() {
  return <svg className="forest" viewBox="0 0 960 560" aria-hidden="true">
    <defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#bfddd0"/><stop offset="1" stopColor="#f4dfb1"/></linearGradient><linearGradient id="ground" x2="0" y2="1"><stop stopColor="#355b46"/><stop offset="1" stopColor="#173d35"/></linearGradient></defs>
    <rect width="960" height="560" rx="28" fill="url(#sky)"/><circle cx="690" cy="150" r="70" fill="#fff0c4"/>
    <path d="M0 330Q200 180 400 320T960 260V560H0Z" fill="#7fafa0"/><path d="M0 410Q300 250 600 350T960 340V560H0Z" fill="#528373"/>
    <path d="M0 460Q400 350 960 430V560H0Z" fill="url(#ground)"/><path d="M300 560Q700 380 650 330Q800 380 590 560" fill="#c2b18a"/>
    {[60, 170, 820, 920].map((x, i) => <g key={x} transform={`translate(${x} ${80 + i % 2 * 70})`}><path d="M-20 0H20L32 420H-30Z" fill="#214b3b"/><ellipse cy="40" rx="100" ry="110" fill={i % 2 ? '#32634b' : '#3d7556'}/><ellipse cx="-30" cy="110" rx="80" ry="70" fill="#376b50"/></g>)}
    <path d="m618 327 32-42 32 42-32 48Z" fill="#98efcd" stroke="#e7ffe6" strokeWidth="5"/><path d="m650 285-9 42 9 48 12-48Z" fill="#d5ffe9"/>
    <g transform="translate(420 380)"><ellipse cy="62" rx="42" ry="12" fill="#102f29" opacity=".35"/><path d="M-20 8 0-16 24 8 28 49H-28Z" fill="#d99c52"/><circle cy="-12" r="19" fill="#eac6a1"/><path d="M-23-18 0-46 24-18Z" fill="#255d54"/><path d="M-12 49-16 64M12 49 16 64" stroke="#233e35" strokeWidth="11"/><path d="M29 12 45 40" stroke="#eac6a1" strokeWidth="8"/></g>
    <g fill="#f6df8f"><circle cx="280" cy="320" r="3"/><circle cx="710" cy="300" r="4"/><circle cx="490" cy="170" r="3"/></g>
  </svg>;
}

export function Home({ library, onStart, busy, error }: { library: Library; onStart(): Promise<void>; busy: boolean; error: string }) {
  const protectedSession = !!(library.gate?.activeRunId || library.gate?.lockedRunId);
  const failed = library.runs.find(r => r.status === 'lost');
  return <>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">CHAPTER ONE · THE FOREST</p><h1>A world waiting<br/>for your words.</h1><p>{protectedSession ? 'Every word is a step forward. Your saved adventure is ready.' : 'Beyond the trees, a lost crystal is waiting. Discover its words. Follow the light.'}</p>
      {library.gate?.lockedRunId ? <a className="button" href={`#/review/${library.gate.lockedRunId}`}>Review Mistakes</a> : library.gate?.activeRunId ? <a className="button" href={`#/battle/${library.gate.activeRunId}`}>Resume Battle</a> : <button className="button" disabled={busy} onClick={onStart}>{busy ? 'Preparing your challenge…' : failed && !library.progress?.crystalIds.length ? 'Retry Boss' : 'Challenge the guardian'}</button>}
      {!protectedSession && <a className="text-link" href="#/words">Explore your words</a>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </div><Forest /></section>
    <section className="journey" aria-label="Your journey"><div><span className="eyebrow">YOUR JOURNEY</span><h2>The first light</h2><p>Small discoveries. A bigger adventure.</p></div><article><span className="stat-icon">◇</span><strong>{library.progress?.crystalIds.length || 0} / 1</strong><span>{protectedSession ? 'Demo reward' : 'Demo crystal'}</span></article><article><span className="stat-icon">✦</span><strong>{library.words.length}</strong><span>Words to discover</span></article><article><span className="stat-icon">♧</span><strong>Forest</strong><span>Your first destination</span></article></section>
  </>;
}
