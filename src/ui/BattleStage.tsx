import type { BattleView } from '../services/game';

export function BattleStage({ run, effect }: { run: BattleView; effect?: 'hero-hit' | 'boss-hit' }) {
  return <section className={`battle-stage ${effect || ''} ${run.status === 'won' ? 'guardian-defeated' : ''}`} aria-label="Forest battle arena">
    <div className="battle-hud"><div><span>EXPLORER</span><strong>{run.currentHp} / {run.initialHp} HP</strong><div className="hearts" aria-hidden="true">{Array.from({ length: run.initialHp }, (_, i) => <i key={i} className={i < run.currentHp ? 'lit' : ''}>♥</i>)}</div></div><div className="boss-hud"><span>FOREST GUARDIAN</span><strong>{run.bossCurrentHp} / 8 HP</strong><progress value={run.bossCurrentHp} max={8} aria-label="Forest Guardian health" /></div></div>
    <div className="arena-mist" aria-hidden="true" />
    <div className="fighter explorer" aria-label="Your explorer"><svg viewBox="0 0 180 220" role="img" aria-label="Explorer holding a glowing staff">
      <ellipse cx="90" cy="204" rx="57" ry="11" fill="#102a27" opacity=".35"/><path d="M60 100 90 85 120 100 136 182H42Z" fill="#d99c52"/><path d="m70 103 20 50 20-50" fill="#f6dfac"/><path d="m61 173-4 30m57-30 8 30" stroke="#173e37" strokeWidth="16"/><circle cx="90" cy="72" r="27" fill="#edc79c"/><path d="m49 61 40-59 42 61Z" fill="#2e7763"/><path d="M49 62h83" stroke="#163f36" strokeWidth="10" strokeLinecap="round"/><path d="m115 113 23 17" stroke="#edc79c" strokeWidth="14" strokeLinecap="round"/><path d="m142 78-5 110" stroke="#8c6139" strokeWidth="8"/><path d="m144 40 17 26-17 27-17-27Z" fill="#a8f4d2" stroke="#e5ffe8" strokeWidth="4"/><circle cx="81" cy="73" r="3" fill="#23473d"/><circle cx="99" cy="73" r="3" fill="#23473d"/>
    </svg><span>YOU</span>{effect === 'hero-hit' && <b className="damage">−1</b>}</div>
    <div className="fighter guardian" aria-label="The Forest Guardian"><svg viewBox="0 0 230 240" role="img" aria-label="Friendly stone guardian with mossy shoulders">
      <ellipse cx="116" cy="224" rx="87" ry="12" fill="#102a27" opacity=".35"/><path d="m61 108-25 19-17 53 25 9 29-31m96-50 25 19 17 53-25 9-29-31" fill="#52766b" stroke="#2d554a" strokeWidth="6"/><path d="m68 174-7 44 41 3 9-38m18 0 5 38 39-3-8-44" fill="#55796d" stroke="#2d554a" strokeWidth="6"/><path d="m62 67 47-27 59 22 16 72-24 55-92-2-24-60Z" fill="#719387" stroke="#315b4e" strokeWidth="6"/><path d="m58 75 33-34 21 12 26-20 36 29-13 24-37-5-29 13Z" fill="#396d4d"/><path d="m72 104 26 4m35 0 25-5" stroke="#d1f7a9" strokeWidth="10" strokeLinecap="round"/><path d="M93 142q24 15 45-1" fill="none" stroke="#345c4f" strokeWidth="7" strokeLinecap="round"/><path d="m101 65 15-22 18 22-16 23Z" fill="#c5efb5"/><path d="m52 91-16-27 27 8m106 13 22-32-3 42" fill="#548b55"/>
    </svg><span>GUARDIAN</span>{effect === 'boss-hit' && <b className="damage">−1</b>}</div>
    {effect && <div className={`spell-projectile ${effect}`} aria-hidden="true" />}
    <div className="arena-caption">Forest of Echoes · Guardian's clearing</div>
  </section>;
}
