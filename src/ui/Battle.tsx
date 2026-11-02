import { useEffect, useRef, useState } from 'react';
import { game } from '../services/runtime';
import type { BattleView } from '../services/game';
import type { Library } from './session';
import { goReview } from './session';
import { BattleStage } from './BattleStage';
import { QuestionForm } from './QuestionForm';
import { friendlyError } from './errors';

type Shown = Awaited<ReturnType<typeof game.presentBattleQuestion>>;
export function Battle({ run, library }: { run: BattleView; library: Library }) {
  const [shown, setShown] = useState<Shown>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replacementBlocked, setReplacementBlocked] = useState(false);
  const [feedback, setFeedback] = useState<{ effect: 'boss-hit' | 'hero-hit'; text: string }>();
  const pending = useRef(false);
  useEffect(() => {
    if (run.status !== 'active' || busy || feedback || replacementBlocked || shown?.run.version === run.version) return;
    let cancelled = false;
    game.presentBattleQuestion(run.runId).then(value => { if (!cancelled) { setShown(value); setError(''); } }).catch(failure => { if (!cancelled) { setError(friendlyError(failure)); setReplacementBlocked(true); setShown(undefined); } });
    return () => { cancelled = true; };
  }, [run.runId, run.version, run.status, busy, feedback, replacementBlocked, shown?.run.version]);

  async function submit(answer: string, submissionId: string) {
    if (!shown || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await game.submitBattle({ submissionId, runId: run.runId, instanceId: shown.instanceId, expectedVersion: shown.run.version, answer });
      if (result.kind === 'settled') {
        const correct = result.run.bossCurrentHp < shown.run.bossCurrentHp;
        setFeedback({ effect: correct ? 'boss-hit' : 'hero-hit', text: correct ? 'Your spell hits! Guardian −1 HP.' : 'The guardian strikes. Explorer −1 HP.' });
      } else {
        setError(result.reason === 'assisted-instance-needs-replacement' ? 'This question used assistance and cannot count as an attack. Ask a grown-up for help.' : 'This question changed in another window. Your saved health is unchanged by this submission.');
        setShown(undefined);
      }
    } catch (failure) { setError(friendlyError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function next() {
    setBusy(true); setError('');
    try { setShown(await game.presentBattleQuestion(run.runId)); setFeedback(undefined); }
    catch (failure) { setError(friendlyError(failure)); }
    finally { setBusy(false); }
  }
  const mistakes = library.tasks.filter(t => t.failureRunId === run.runId);
  return <div className="battle-page">
    <div className="battle-heading"><div><p className="eyebrow">ORIGINAL DEMO · BOSS CHALLENGE</p><h1>The forest guardian</h1></div><p data-testid="effective-progress">Saved answers: {run.effectiveAnswerCount} / {run.maxQuestionCount}</p></div>
    <div className="battle-health-bar" aria-label="Saved health"><span>Explorer <strong data-testid="hero-hp">{run.currentHp} / {run.initialHp} HP</strong></span><span>Guardian <strong data-testid="boss-hp">{run.bossCurrentHp} / 8 HP</strong></span></div>
    <BattleStage run={run} effect={feedback?.effect} />
    <div className={`combat-feedback ${feedback?.effect || ''}`} role="status">{feedback?.text || 'Your progress is saved after every answer.'}</div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {replacementBlocked && <button className="secondary-button" onClick={() => setReplacementBlocked(false)}>Check saved question again</button>}
    {run.status === 'won' ? <section className="result-card victory" data-testid="battle-victory"><p className="eyebrow">GUARDIAN DEFEATED</p><h2>The forest crystal is safe!</h2><p>You landed eight independent spells. Both words helped light the way.</p><p>Your result is saved. Keep learning and revisiting your words.</p><a className="primary-button" href="#/">Return to your adventure</a></section>
      : run.status === 'lost' ? <section className="result-card" data-testid="battle-defeat"><p className="eyebrow">TIME TO REST AND LEARN</p><h2>A new spell begins with a little practice.</h2><p>The guardian is locked until every required review is complete.</p><ul>{mistakes.map(task => <li key={task.taskId}>{library.words.find(w => w.wordId === task.wordId)?.headword} · {task.dimension === 'wordFormation' ? 'Word Formation' : task.dimension}</li>)}</ul><button className="primary-button" onClick={() => goReview(run.runId)}>Review Mistakes</button></section>
        : feedback ? <div className="next-question"><button className="primary-button" disabled={busy} onClick={next}>Next challenge</button></div>
          : shown ? <QuestionForm key={shown.instanceId} choiceSeed={shown.instanceId} question={shown.question} disabled={busy} onSubmit={submit} /> : <p role="status">Opening your saved question…</p>}
  </div>;
}
