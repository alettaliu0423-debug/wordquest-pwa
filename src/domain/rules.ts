import type { BattleRun, Dimension, Objective, Question, QuestionType, Word } from './model';

export class RuleError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'RuleError'; }
}
export function requireRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RuleError(code);
}
export function validateHp(value: unknown): number {
  requireRule(typeof value === 'number' && Number.isInteger(value) && value >= 3 && value <= 10, 'INVALID_HP');
  return value;
}
export function maximumQuestions(hp: unknown): number { return 8 + validateHp(hp) - 1; }
export function normalizeAnswer(value: string): string { return value.normalize('NFKC').trim().toLowerCase(); }
const normalizeContent = (value: string) => normalizeAnswer(value).replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();

// Canonical, collision-free content identity. IDs, punctuation and option order are excluded.
export function fingerprint(question: Pick<Question, 'type' | 'prompt' | 'choices' | 'answer'>): string {
  return 'qf1:' + JSON.stringify({
    type: question.type, prompt: normalizeContent(question.prompt),
    choices: (question.choices || []).map(normalizeContent).sort(), answer: normalizeContent(question.answer),
  });
}
export function dimensionOf(type: QuestionType): Dimension {
  switch (type) {
    case 'meaning-match': return 'meaning';
    case 'context-challenge': return 'context';
    case 'listen-spell': case 'meaning-spell': return 'spelling';
    case 'word-formation': return 'wordFormation';
  }
}
export function validateQuestion(q: Question, words: Word[], objectives: Objective[]): void {
  requireRule(['meaning-match', 'context-challenge', 'listen-spell', 'meaning-spell', 'word-formation'].includes(q.type), 'INVALID_QUESTION_TYPE');
  requireRule(q.type !== 'word-formation', 'WORD_FORMATION_NOT_ENABLED');
  requireRule(q.prompt.trim() && q.answer.trim() && q.fingerprint === fingerprint(q), 'INVALID_QUESTION');
  const word = words.find(w => w.wordId === q.wordId && w.scope === q.scope);
  const objective = objectives.find(o => o.objectiveId === q.objectiveId && o.wordId === q.wordId && o.scope === q.scope);
  requireRule(word && objective, 'INVALID_OBJECTIVE_BINDING');
  if (q.type === 'meaning-match' || q.type === 'context-challenge') {
    const choices = q.choices?.map(normalizeAnswer);
    requireRule(choices && choices.length >= 2 && new Set(choices).size === choices.length && choices.includes(normalizeAnswer(q.answer)), 'INVALID_CHOICES');
  } else {
    requireRule(normalizeAnswer(q.answer) === word.normalizedWord, 'INVALID_SPELLING_TARGET');
    const promptWords = normalizeContent(q.prompt).split(' ');
    requireRule(!promptWords.includes(word.normalizedWord), 'SPELLING_ANSWER_EXPOSED');
  }
  if (q.type === 'listen-spell') requireRule(q.audioRef, 'MISSING_AUDIO_REFERENCE');
}
const CORE_TYPES: QuestionType[] = ['meaning-match', 'context-challenge', 'listen-spell', 'meaning-spell'];
export function buildQuestionSet(pool: Question[], objectiveIds: string[], hp: number, runNumber: number): Question[] {
  const maximum = maximumQuestions(hp);
  requireRule(objectiveIds.length === 2 && new Set(objectiveIds).size === 2, 'TWO_CORE_OBJECTIVES_REQUIRED');
  requireRule(pool.length >= maximum && new Set(pool.map(q => q.fingerprint)).size === pool.length, 'INSUFFICIENT_UNIQUE_QUESTIONS');
  requireRule(pool.every(q => q.purpose === 'battle' && q.scope === 'demo' && q.fingerprint === fingerprint(q)), 'INVALID_BATTLE_POOL');
  requireRule(pool.every(q => objectiveIds.includes(q.objectiveId) && CORE_TYPES.includes(q.type)), 'INVALID_CHAPTER_QUESTION');
  const chosen: Question[] = [];
  for (const objectiveId of objectiveIds) {
    for (const type of CORE_TYPES) {
      const candidates = pool.filter(q => q.objectiveId === objectiveId && q.type === type).sort((a, b) => a.variant - b.variant);
      requireRule(candidates.length, 'MISSING_REQUIRED_QUESTION');
      chosen.push(candidates[runNumber % candidates.length]);
    }
  }
  const fingerprints = new Set(chosen.map(q => q.fingerprint));
  requireRule(fingerprints.size === 8, 'DUPLICATE_CORE_QUESTION');
  const reserves = pool.filter(q => !fingerprints.has(q.fingerprint));
  const offset = runNumber % Math.max(reserves.length, 1);
  const rotated = [...reserves.slice(offset), ...reserves.slice(0, offset)];
  requireRule(chosen.length + rotated.length >= maximum, 'INSUFFICIENT_UNIQUE_QUESTIONS');
  return [...chosen, ...rotated].slice(0, maximum);
}
export function settle(run: BattleRun, correct: boolean, now: string): BattleRun {
  requireRule(run.status === 'active', 'RUN_ENDED');
  const next = structuredClone(run);
  const instance = next.questionSet[next.currentQuestionIndex];
  requireRule(instance && !instance.settled && !instance.assisted && instance.presentedAt, 'INVALID_QUESTION_INSTANCE');
  if (correct) next.bossCurrentHp -= 1; else next.currentHp -= 1;
  instance.settled = true;
  next.effectiveAnswerCount += 1;
  next.currentQuestionIndex += 1;
  next.version += 1;
  if (next.bossCurrentHp === 0) { next.status = 'won'; next.endedAt = now; }
  else if (next.currentHp === 0) { next.status = 'lost'; next.endedAt = now; }
  requireRule(next.status !== 'active' || next.effectiveAnswerCount < next.maxQuestionCount, 'INVALID_QUESTION_BOUND');
  return next;
}
