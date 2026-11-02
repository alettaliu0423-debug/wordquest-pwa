import { useEffect, useRef, useState, type FormEvent } from 'react';
import { pronunciationBlob } from '../audio/pronunciation';
import type { SafeQuestion } from '../domain/model';
import { friendlyError } from './errors';
import { orderedChoices } from './choiceOrder';

export const questionLabels = {
  'meaning-match': 'Meaning Match', 'context-challenge': 'Context Challenge',
  'listen-spell': 'Listen & Spell', 'meaning-spell': 'Meaning & Spell', 'word-formation': 'Word Formation',
};

export function Pronunciation({ audioRef, onHeard, disabled = false, label = 'Play pronunciation' }: {
  audioRef: string; onHeard?: () => void; disabled?: boolean; label?: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef<string | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const player = audio.current; return () => { player?.pause(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }; }, []);
  async function play() {
    if (playing || disabled) return;
    setError(''); setPlaying(true);
    try {
      const blob = await pronunciationBlob(audioRef);
      if (!audio.current) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      audio.current.src = objectUrl.current;
      await audio.current.play();
    } catch (failure) { setError(friendlyError(failure)); setPlaying(false); }
  }
  return <div className="pronunciation">
    <button type="button" className="secondary-button audio-button" disabled={playing || disabled} onClick={play}>{playing ? 'Listening…' : label}</button>
    <audio ref={audio} preload="none" onEnded={() => { setPlaying(false); onHeard?.(); }} onError={() => { setPlaying(false); setError('Audio could not play. Tap the play button to try again.'); }} />
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function QuestionForm({ question, disabled, onSubmit, choiceSeed, submitLabel = 'Cast your spell' }: {
  question: SafeQuestion; disabled: boolean; onSubmit(answer: string, submissionId: string): Promise<void>; choiceSeed: string; submitLabel?: string;
}) {
  const [answer, setAnswer] = useState('');
  const [heard, setHeard] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const submissionId = useRef(crypto.randomUUID());
  const spelling = question.type === 'listen-spell' || question.type === 'meaning-spell';
  function keepAnswerVisible() {
    const entry = input.current;
    if (!entry || document.activeElement !== entry) return;
    const submitButton = entry.closest('form')?.querySelector<HTMLButtonElement>('.submit-answer');
    if (!submitButton) return;
    const viewport = window.visualViewport;
    const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 16;
    const top = (viewport?.offsetTop || 0) + (document.querySelector('.battle-health-bar')?.getBoundingClientRect().height || 0) + 12;
    if (submitButton.getBoundingClientRect().bottom > bottom) window.scrollBy({ top: submitButton.getBoundingClientRect().bottom - bottom, behavior: 'instant' });
    if (entry.getBoundingClientRect().top < top) window.scrollBy({ top: entry.getBoundingClientRect().top - top, behavior: 'instant' });
  }
  useEffect(() => {
    const adjust = () => requestAnimationFrame(keepAnswerVisible);
    window.visualViewport?.addEventListener('resize', adjust); window.addEventListener('resize', adjust);
    return () => { window.visualViewport?.removeEventListener('resize', adjust); window.removeEventListener('resize', adjust); };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || submitting.current) return;
    if (!answer.trim()) { setMessage(spelling ? 'Type the whole word to continue.' : 'Choose an answer to continue.'); return; }
    if (question.type === 'listen-spell' && !heard) { setMessage('Listen to the whole word before you spell it.'); return; }
    submitting.current = true; setMessage('');
    try { await onSubmit(answer, submissionId.current); } finally { submitting.current = false; }
  }
  return <form className="question-form" data-question-type={question.type} onSubmit={submit}>
    <span className="question-type">{questionLabels[question.type]}</span>
    <h2>{question.prompt}</h2>
    {question.type === 'listen-spell' && question.audioRef && <>
      <Pronunciation audioRef={question.audioRef} disabled={disabled} label="Play word" onHeard={() => { setHeard(true); setMessage(''); input.current?.focus(); }} />
      <p className="listening-state" role="status">{heard ? 'Word heard. Now spell it in full.' : 'Play the word. You can listen again.'}</p>
    </>}
    {spelling ? <label className="spelling-label">Your spelling
      <input ref={input} name="spelling" aria-label="Your spelling" type="text" value={answer} disabled={disabled} onChange={event => setAnswer(event.target.value)}
        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} inputMode="text" enterKeyHint="done"
        onFocus={() => requestAnimationFrame(keepAnswerVisible)} />
    </label> : <fieldset disabled={disabled}><legend className="sr-only">Choose your answer</legend><div className="answer-options">{orderedChoices(question.choices || [], choiceSeed).map(choice => <button type="button" key={choice} aria-pressed={answer === choice} onClick={() => setAnswer(choice)}>{choice}</button>)}</div></fieldset>}
    {message && <p role="alert" className="form-error">{message}</p>}
    <button className="primary-button submit-answer" type="submit" disabled={disabled || (question.type === 'listen-spell' && !heard)}>{disabled ? 'Saving…' : submitLabel}</button>
  </form>;
}
