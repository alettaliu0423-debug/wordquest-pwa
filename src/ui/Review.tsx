import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { game } from '../services/runtime';
import type { Library } from './session';
import { QuestionForm, Pronunciation } from './QuestionForm';
import { friendlyError } from './errors';

const dimensions = { meaning: 'Meaning', context: 'Context', spelling: 'Spelling', wordFormation: 'Word Formation' };

export function Review({ runId, library, onRetry }: { runId: string; library: Library; onRetry(): Promise<void> }) {
  const tasks = library.tasks.filter(t => t.failureRunId === runId);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const pending = useRef(false);
  const [teachingGrant, setTeachingGrant] = useState<string>();
  const grant = useRef<{ taskId: string; revision: number } | undefined>(undefined);
  const verification = useRef(0);
  const locallyClosed = useRef<string | undefined>(undefined);
  const [requestedTask, setRequestedTask] = useState<string | undefined>(() => sessionStorage.getItem('wordquest:teaching-task') || undefined);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  function requestTeaching(taskId: string) {
    sessionStorage.setItem('wordquest:teaching-task', taskId); setRequestedTask(taskId); setVerificationAttempt(n => n + 1);
  }
  // Derive synchronously: a refresh must never flash the answer-bearing task list
  // before an already-persisted independent check is restored.
  const task = tasks.find(t => t.phase === 'awaiting-answer') || tasks.find(t => t.phase === 'ready') || tasks.find(t => t.phase === 'teaching-open') || tasks.find(t => t.taskId === selected);
  const unsafe = !!task && ['ready', 'awaiting-answer'].includes(task.phase) && task.independencePolicy !== 2;
  const grantKey = task && `${task.taskId}:${task.revision}`;
  useEffect(() => { if (unsafe) game.reconcileReviewSafety().catch(failure => setError(friendlyError(failure))); }, [unsafe, task?.revision]);
  // A cached component or a restored tab must obtain a current transactional grant
  // before rendering teaching answers. Hide cards before a background/BFCache pause.
  useLayoutEffect(() => {
    if (grant.current && (task?.phase !== 'teaching-open' || teachingGrant !== grantKey)) {
      const old = grant.current; grant.current = undefined; setTeachingGrant(undefined);
      if (locallyClosed.current !== `${old.taskId}:${old.revision}`) game.reportReviewExposure(old.taskId, old.revision).catch(failure => setError(friendlyError(failure)));
    }
  }, [task?.phase, grantKey, teachingGrant]);
  useEffect(() => {
    let disposed = false;
    const hide = () => { verification.current += 1; grant.current = undefined; setTeachingGrant(undefined); };
    const verify = () => {
      hide();
      const ticket = verification.current;
      if (task?.phase === 'teaching-open' && requestedTask === task.taskId && document.visibilityState !== 'hidden') {
        game.beginTeaching(task.taskId, task.revision).then(saved => {
          if (!disposed && ticket === verification.current && document.visibilityState !== 'hidden') {
            grant.current = { taskId: saved.task.taskId, revision: saved.task.revision };
            setTeachingGrant(`${saved.task.taskId}:${saved.task.revision}`);
          }
        }).catch(failure => { if (!disposed) setError(friendlyError(failure)); });
      }
    };
    const visibility = () => document.visibilityState === 'hidden' ? hide() : verify();
    verify(); addEventListener('pagehide', hide); addEventListener('pageshow', verify); document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; hide(); removeEventListener('pagehide', hide); removeEventListener('pageshow', verify); document.removeEventListener('visibilitychange', visibility); };
  }, [task?.taskId, task?.revision, task?.phase, requestedTask, verificationAttempt]);
  const word = library.words.find(w => w.wordId === task?.wordId);
  const objective = library.objectives.find(o => o.objectiveId === task?.objectiveId);
  const completed = tasks.filter(t => t.phase === 'passed').length;
  const unlocked = tasks.length > 0 && completed === tasks.length && !library.gate?.lockedRunId;

  async function action(work: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setFeedback('');
    try { await work(); } catch (failure) { setError(friendlyError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="review-page">
    <p className="eyebrow">REQUIRED REVIEW · ORIGINAL DEMO</p><h1>Build your next spell.</h1>
    <p className="review-progress" data-testid="review-progress">Independent checks passed: {completed} / {tasks.length}</p>
    <p>{unlocked ? 'Every required check is complete. You are ready for a fresh challenge.' : 'Each part needs its own fresh, independent check before the guardian opens again.'}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {feedback && <p role="status" className="review-feedback">{feedback}</p>}
    {unsafe ? <p role="status">Checking that your next question is independent…</p> : task?.phase === 'teaching-open' && teachingGrant !== grantKey ? <div><p role="status">{requestedTask === task.taskId ? 'Checking your saved learning card…' : 'A learning card is open. This window has not opened its answer.'}</p><button className="secondary-button" disabled={busy} onClick={() => requestTeaching(task.taskId)}>Open learning card here</button></div> : task?.phase === 'teaching-open' && word && objective ? <article className="teaching-card" data-testid="teaching-card">
      <span className="question-type">{dimensions[task.dimension]} · Learn it again</span><h2>{word.headword}</h2>
      <p className="definition">{objective.definition}</p><blockquote>{objective.exampleSentence}</blockquote>
      {task.dimension === 'meaning' && <p>{word.headword === 'crystal' ? 'A ribbon bends, a feather is light, and a twig comes from a tree. This word names a mineral with regular flat faces.' : 'This word describes a glad feeling. Silent means not making a sound; narrow describes a small width.'}</p>}
      {task.dimension === 'context' && <p>{word.headword === 'crystal' ? 'Look for clues such as quartz, mineral, flat faces and regular edges. The whole sentence helps you choose the noun.' : 'Look for clues about good news, a safe return or a cheerful smile. Ask how the person feels in the whole sentence.'}</p>}
      {task.dimension === 'spelling' && <div className="spelling-teaching"><strong aria-label="Full spelling">{word.headword.split('').join(' · ')}</strong><p>{word.headword === 'crystal' ? 'Seven letters. Keep the order: c-r-y-s-t-a-l. The ending is t-a-l.' : 'Five letters. Remember the double p before the final y: h-a-p-p-y.'}</p></div>}
      {word.audioRef && <Pronunciation audioRef={word.audioRef} disabled={busy} />}
      <p className="teaching-note">Close this card first. Your next question will use a different clue, without the answer on screen.</p>
      <button className="primary-button" disabled={busy} onClick={() => { locallyClosed.current = grantKey; verification.current += 1; grant.current = undefined; setTeachingGrant(undefined); sessionStorage.removeItem('wordquest:teaching-task'); setRequestedTask(undefined); action(() => game.closeTeaching(task.taskId, task.revision)); }}>Close learning card</button>
    </article> : task?.phase === 'ready' ? <article className="ready-card" data-testid="independent-ready"><h2>Ready to try on your own?</h2><p>The learning card is closed. A new question is waiting.</p><button className="primary-button" disabled={busy} onClick={() => action(() => game.presentRetest(task.taskId, task.revision))}>Start independent check</button></article>
      : task?.phase === 'awaiting-answer' && task.currentQuestion ? <div data-testid="independent-retest"><QuestionForm key={`${task.taskId}:${task.revision}`} choiceSeed={`${task.taskId}:${task.revision}`} question={task.currentQuestion} disabled={busy} submitLabel="Check my answer" onSubmit={(answer, submissionId) => action(async () => {
        const result = await game.submitRetest({ taskId: task.taskId, expectedRevision: task.revision, submissionId, answer });
        setSelected(undefined);
        setFeedback(result.kind === 'passed' ? 'Independent check passed. This part of your review is saved.' : result.kind === 'invalidated' ? 'That question may have shown an answer. Read the learning card again, then use a new question.' : 'Not quite yet. Read the learning card again, then try a different question.');
      })} /></div>
        : <div className="review-list">{tasks.map(item => <article key={item.taskId} className={`review-task ${item.phase === 'passed' ? 'complete' : ''}`}>
          <div><span className="question-type">{dimensions[item.dimension]}</span><h2>{library.words.find(w => w.wordId === item.wordId)?.headword}</h2></div>
          {item.phase === 'passed' ? <span className="passed-badge">Passed independently</span> : item.phase === 'exhausted' ? <p className="exhausted" role="status">The different questions for this part are used up. The guardian stays locked. Ask a grown-up to add new questions.</p> : <button className="secondary-button" disabled={busy} onClick={() => action(async () => { await game.beginTeaching(item.taskId, item.revision); setSelected(item.taskId); requestTeaching(item.taskId); })}>Learn again</button>}
        </article>)}</div>}
    {!tasks.length && <p>No required review is saved for this battle.</p>}
    {unlocked && <div className="retry-panel"><h2>Your next adventure is ready.</h2><p>A fresh battle starts with full explorer health and a guardian with 8 HP.</p><button className="primary-button" disabled={busy || !!library.gate?.activeRunId} onClick={() => action(onRetry)}>Retry Boss</button></div>}
    {!unlocked && tasks.length > 0 && <p className="locked-notice" data-testid="review-lock">Guardian locked · Complete all {tasks.length} required checks.</p>}
  </section>;
}
