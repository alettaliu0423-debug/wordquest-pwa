import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { seedDemo } from '../content/demo';
import { db } from '../db/runtime';
import { game } from '../services/runtime';
import { Home } from './Home';
import { Battle } from './Battle';
import { Review } from './Review';
import { Pronunciation } from './QuestionForm';
import { OfflineStatus } from './OfflineStatus';
import { friendlyError } from './errors';
import { readLibrary, goBattle, type Library } from './session';

function readRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  let id = ''; try { id = decodeURIComponent(parts[1] || ''); } catch { /* Invalid URL has no matching record. */ }
  return { page: parts[0] || 'home', id };
}

export function App() {
  const [route, setRoute] = useState(readRoute);
  const [library, setLibrary] = useState<Library>();
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    const navigate = () => setRoute(readRoute());
    addEventListener('hashchange', navigate);
    let cancelled = false;
    let subscription: { unsubscribe(): void } | undefined;
    seedDemo(db).then(() => game.reconcileReviewSafety()).then(() => {
      if (cancelled) return;
      subscription = liveQuery(readLibrary).subscribe({ next: setLibrary, error: () => setError(true) });
    }).catch(() => setError(true));
    return () => { cancelled = true; subscription?.unsubscribe(); removeEventListener('hashchange', navigate); };
  }, []);
  const protectedSession = !library || !!(library.gate?.activeRunId || library.gate?.lockedRunId);
  const independent = library?.tasks.find(t => t.phase === 'ready' || t.phase === 'awaiting-answer');
  const effective = independent ? { page: 'review', id: independent.failureRunId }
    : library?.gate?.activeRunId && route.page !== 'home' && !(route.page === 'battle' && route.id === library.gate.activeRunId)
      ? { page: 'battle', id: library.gate.activeRunId }
      : route.page === 'words' && library?.gate?.lockedRunId ? { page: 'review', id: library.gate.lockedRunId } : route;
  const run = library?.runs.find(r => r.runId === effective.id);
  const reviewId = effective.id || library?.gate?.lockedRunId || library?.runs.find(r => r.status === 'lost')?.runId || '';
  useEffect(() => { document.title = protectedSession ? 'WordQuest · Challenge' : 'WordQuest: The Lost Crystal'; }, [protectedSession]);
  async function start() {
    if (pending.current) return;
    pending.current = true; setStarting(true); setStartError('');
    try { const saved = await game.startChallenge(); goBattle(saved.runId); }
    catch (failure) { setStartError(friendlyError(failure)); throw failure; }
    finally { pending.current = false; setStarting(false); }
  }
  return <div className="app-shell">
    <header className="topbar"><a href="#/" className="brand"><span className="brand-icon">◇</span><span>WORDQUEST<small>{protectedSession ? 'DEMO ADVENTURE' : 'THE LOST CRYSTAL'}</small></span></a><nav aria-label="Main navigation"><a href="#/" aria-current={effective.page === 'home' ? 'page' : undefined}>Home</a>{!protectedSession && <a href="#/words" aria-current={effective.page === 'words' ? 'page' : undefined}>Word Bank</a>}{library?.gate?.activeRunId && <a href={`#/battle/${library.gate.activeRunId}`}>Battle</a>}{library?.gate?.lockedRunId && <a href={`#/review/${library.gate.lockedRunId}`}>Review</a>}</nav><span className="demo-label">ORIGINAL DEMO</span></header>
    <main>{error ? <div role="alert" className="error"><h1>We couldn't open your adventure.</h1><p>Your saved progress has not been reset. Please keep this page open and try again later.</p></div> : !library ? <p role="status">Opening your adventure…</p>
      : effective.page === 'battle' ? run ? <Battle key={run.runId} run={run} library={library} /> : <section><h1>No saved battle found.</h1><a className="button" href="#/">Return Home</a></section>
        : effective.page === 'review' ? <Review key={reviewId} runId={reviewId} library={library} onRetry={start} />
          : effective.page === 'words' ? <section className="word-bank"><p className="eyebrow">YOUR WORD BANK</p><h1>Words worth discovering.</h1><p className="intro">Every word has a meaning. Every meaning opens a door.</p><div className="word-grid">{library.words.map(word => <article className="word-card" key={word.wordId}><div className="word-title"><h2>{word.headword}</h2><span>{word.partOfSpeech}</span></div>{library.objectives.filter(o => o.wordId === word.wordId).map(objective => <div key={objective.objectiveId}><span className="learning-status">{library.states.find(s => s.objectiveId === objective.objectiveId)?.status || 'New'}</span><p>{objective.definition}</p><blockquote>{objective.exampleSentence}</blockquote></div>)}{word.audioRef && <Pronunciation audioRef={word.audioRef} />}<small>Original WordQuest Demo</small></article>)}</div></section>
            : <Home library={library} onStart={() => start().catch(() => undefined)} busy={starting} error={startError} />}
    </main><OfflineStatus protectedSession={protectedSession} /><footer><span>Original demo vocabulary · Your progress stays on this device.</span><span>{protectedSession ? 'WordQuest · Demo adventure' : 'WordQuest · The Lost Crystal'}</span></footer>
  </div>;
}
