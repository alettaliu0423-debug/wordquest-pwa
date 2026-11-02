import type { WordQuestDB } from '../db/database';
import { DEMO_OBJECTIVES } from '../content/demo';
import type {
  Answer, BattleRun, Dimension, LearningState, Question, RemediationTask, Scope, Submission,
} from '../domain/model';
import { publicQuestion } from '../domain/model';
import {
  buildQuestionSet, dimensionOf, maximumQuestions, normalizeAnswer, requireRule, settle,
  validateHp, validateQuestion,
} from '../domain/rules';

export type BattleView = Omit<BattleRun, 'questionSet' | 'retiredQuestions'>;
export function battleView(run: BattleRun): BattleView {
  const { questionSet: _questions, retiredQuestions: _retired, ...view } = run;
  return view;
}
type BattleResult = { kind: 'settled' | 'assisted' | 'duplicate' | 'ignored'; run: BattleView; reason?: string };
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const freshDimensions = (): LearningState['dimensions'] => ({
  meaning: { correct: 0, wrong: 0, assisted: 0 }, context: { correct: 0, wrong: 0, assisted: 0 },
  spelling: { correct: 0, wrong: 0, assisted: 0 }, wordFormation: { correct: 0, wrong: 0, assisted: 0 },
});

/** The only application service that may settle battles, unlock retries or grant crystals. */
export class GameService {
  constructor(private readonly db: WordQuestDB, private readonly assets?: { beforeStart(): Promise<void> }) {}

  async setPlayerHp(value: unknown): Promise<void> {
    const hp = validateHp(value);
    await this.db.settings.put({ scope: 'demo', playerHp: hp });
  }

  async startChallenge(request: { mode?: string; scope?: Scope } = {}): Promise<BattleView> {
    requireRule((request.mode ?? 'boss') === 'boss', 'PRACTICE_NOT_AVAILABLE');
    requireRule((request.scope ?? 'demo') === 'demo', 'REAL_CHALLENGES_NOT_AVAILABLE');
    await this.assets?.beforeStart();
    return this.db.transaction('rw', this.db.tables, async () => {
      const gate = await this.db.gates.get('demo');
      requireRule(gate, 'CONTENT_NOT_READY');
      requireRule(!gate.lockedRunId, 'REVIEW_LOCKED');
      requireRule(!gate.activeRunId, 'ACTIVE_RUN_EXISTS');
      const settings = await this.db.settings.get('demo');
      const hp = validateHp(settings?.playerHp);
      const pool = await this.db.questions.where('[scope+purpose]').equals(['demo', 'battle']).toArray();
      const words = await this.db.words.where('scope').equals('demo').toArray();
      const objectives = await this.db.objectives.where('scope').equals('demo').toArray();
      for (const q of pool) validateQuestion(q, words, objectives);
      const questions = buildQuestionSet(pool, DEMO_OBJECTIVES, hp, gate.nextRunNumber);
      const runId = id();
      const run: BattleRun = {
        runId, scope: 'demo', mode: 'boss', status: 'active', version: 0,
        initialHp: hp, currentHp: hp, bossInitialHp: 8, bossCurrentHp: 8,
        maxQuestionCount: maximumQuestions(hp),
        questionSet: questions.map((question, index) => ({ instanceId: `${runId}:${index}`, question: structuredClone(question), settled: false, assisted: false })),
        currentQuestionIndex: 0, effectiveAnswerCount: 0, createdAt: now(),
      };
      await this.db.runs.add(run);
      await this.db.gates.put({ ...gate, activeRunId: runId, nextRunNumber: gate.nextRunNumber + 1 });
      return battleView(run);
    });
  }

  async presentBattleQuestion(runId: string) {
    return this.db.transaction('rw', this.db.tables, async () => {
      const run = await this.db.runs.get(runId);
      const gate = await this.db.gates.get('demo');
      requireRule(run && run.scope === 'demo' && run.status === 'active' && gate?.activeRunId === runId, 'RUN_NOT_ACTIVE');
      let instance = run.questionSet[run.currentQuestionIndex];
      requireRule(instance && !instance.settled, 'INVALID_QUESTION_INSTANCE');
      if (instance.assisted) {
        await this.replaceAssistedQuestion(run);
        instance = run.questionSet[run.currentQuestionIndex];
      }
      if (!instance.presentedAt) {
        instance.presentedAt = now();
        run.version += 1;
        await this.recordExposure(runId, instance.question, 'battle');
        await this.db.runs.put(run);
      }
      return { run: battleView(run), instanceId: instance.instanceId, question: publicQuestion(instance.question) };
    });
  }

  private async replaceAssistedQuestion(run: BattleRun): Promise<void> {
    const current = run.questionSet[run.currentQuestionIndex];
    // Keep every allocated future question distinct and keep the required slot's type.
    const used = new Set([...run.questionSet, ...(run.retiredQuestions || [])].map(i => i.question.fingerprint));
    const shown = new Set((await this.db.exposures.where('runId').equals(run.runId).toArray()).map(e => e.questionFingerprint));
    const pool = await this.db.questions.where('[scope+purpose]').equals(['demo', 'battle']).toArray();
    const replacement = pool.find(q => q.objectiveId === current.question.objectiveId && q.wordId === current.question.wordId && q.type === current.question.type && !shown.has(q.fingerprint)
      && (!used.has(q.fingerprint) || run.questionSet.some((i, index) => index >= 8 && index > run.currentQuestionIndex && !i.presentedAt && i.question.fingerprint === q.fingerprint)));
    requireRule(replacement, 'ASSISTED_REPLACEMENT_EXHAUSTED');
    validateQuestion(replacement, await this.db.words.where('scope').equals('demo').toArray(), await this.db.objectives.where('scope').equals('demo').toArray());
    const reservedIndex = run.questionSet.findIndex(i => i.question.fingerprint === replacement.fingerprint);
    if (reservedIndex !== -1) {
      const filler = pool.find(q => !used.has(q.fingerprint) && !shown.has(q.fingerprint));
      requireRule(filler, 'ASSISTED_REPLACEMENT_EXHAUSTED');
      validateQuestion(filler, await this.db.words.where('scope').equals('demo').toArray(), await this.db.objectives.where('scope').equals('demo').toArray());
      run.questionSet[reservedIndex] = { instanceId: `${run.runId}:reserve:${id()}`, question: structuredClone(filler), assisted: false, settled: false };
    }
    run.retiredQuestions = [...(run.retiredQuestions || []), structuredClone(current)];
    run.questionSet[run.currentQuestionIndex] = { instanceId: `${run.runId}:replacement:${id()}`, question: structuredClone(replacement), assisted: false, settled: false };
    run.version += 1;
    // Saved together with the new presentation by presentBattleQuestion's transaction.
  }

  async submitBattle(input: Submission): Promise<BattleResult> {
    return this.db.transaction('rw', this.db.tables, async () => {
      const run = await this.db.runs.get(input.runId);
      requireRule(run && run.scope === 'demo', 'UNKNOWN_RUN');
      const prior = await this.db.answers.get(input.submissionId);
      if (prior) {
        requireRule(prior.phase === 'battle' && prior.runId === input.runId && prior.questionInstanceId === input.instanceId && prior.submittedAnswer === input.answer && prior.usedHint === !!input.usedHint, 'SUBMISSION_ID_REUSED');
        return { kind: 'duplicate', run: battleView(run) };
      }
      const ignored = (reason: string): BattleResult => ({ kind: 'ignored', reason, run: battleView(run) });
      if (typeof input.answer !== 'string' || !input.answer.trim()) return ignored('empty-or-invalid');
      if (run.status !== 'active') return ignored('ended');
      const gate = await this.db.gates.get('demo');
      if (gate?.activeRunId !== run.runId || run.version !== input.expectedVersion) return ignored('stale');
      const instance = run.questionSet[run.currentQuestionIndex];
      if (!instance || instance.instanceId !== input.instanceId || instance.settled || !instance.presentedAt) return ignored('wrong-instance');
      if (instance.assisted) return ignored('assisted-instance-needs-replacement');
      const assisted = !!(input.usedHint || input.viewedAnswer);
      const correct = normalizeAnswer(input.answer) === normalizeAnswer(instance.question.answer);
      const answer = this.answerRecord(instance.question, run.runId, instance.instanceId, input.submissionId, input.answer, correct, !!input.usedHint, assisted, 'battle');
      if (!assisted) answer.settlementKey = instance.instanceId;
      await this.db.answers.add(answer);
      await this.recordEvidence(answer);
      if (assisted) {
        instance.assisted = true;
        run.version += 1;
        await this.db.runs.put(run);
        return { kind: 'assisted', run: battleView(run) };
      }
      const next = settle(run, correct, answer.timestamp);
      await this.db.runs.put(next);
      if (next.status === 'lost') {
        const errors = await this.db.answers.where('runId').equals(run.runId).filter(a => a.phase === 'battle' && !a.assisted && !a.isCorrect).toArray();
        const tasks = new Map<string, RemediationTask>();
        for (const error of errors) {
          const dimension = dimensionOf(error.questionType);
          const taskId = `${run.runId}:${error.objectiveId}:${dimension}`;
          tasks.set(taskId, { taskId, failureRunId: run.runId, objectiveId: error.objectiveId, wordId: error.wordId, dimension, scope: 'demo', phase: 'teaching-required', revision: 0 });
        }
        requireRule(tasks.size > 0, 'FAILURE_WITHOUT_ERRORS');
        await this.db.remediationTasks.bulkAdd([...tasks.values()]);
        await this.db.gates.put({ ...gate, scope: 'demo', nextRunNumber: gate.nextRunNumber, activeRunId: undefined, lockedRunId: run.runId });
      } else if (next.status === 'won') {
        const rewardId = 'demo:forest-crystal';
        if (!await this.db.rewards.get(rewardId)) {
          await this.db.rewards.add({ rewardId, scope: 'demo', runId: next.runId, crystalId: 'forest-crystal', awardedAt: answer.timestamp });
          const progress = await this.db.gameProgress.get('demo');
          await this.db.gameProgress.put({ scope: 'demo', crystalIds: [...new Set([...(progress?.crystalIds || []), 'forest-crystal'])], unlockedDemoAreas: ['forest', 'forest-clearing'] });
          await this.db.storyProgress.add({ id: 'demo:forest-crystal', scope: 'demo', sceneId: 'forest-crystal', unlockedAt: answer.timestamp });
        }
        await this.db.gates.put({ ...gate, scope: 'demo', nextRunNumber: gate.nextRunNumber, activeRunId: undefined });
      }
      return { kind: 'settled', run: battleView(next) };
    });
  }

  async beginTeaching(taskId: string, expectedRevision: number) {
    return this.db.transaction('rw', this.db.tables, async () => {
      const task = await this.checkedTask(taskId, expectedRevision);
      await this.requireExclusiveReview(task);
      requireRule(task.phase === 'teaching-required' || task.phase === 'teaching-open', 'TEACHING_NOT_REQUIRED');
      const objective = await this.db.objectives.get(task.objectiveId);
      const word = await this.db.words.get(task.wordId);
      requireRule(objective && word && objective.scope === 'demo' && word.scope === 'demo', 'UNKNOWN_OBJECTIVE');
      if (task.phase !== 'teaching-open') { task.phase = 'teaching-open'; task.revision += 1; await this.advanceReviewPeers(task); }
      await this.db.remediationTasks.put(task);
      return { task, objective, word };
    });
  }

  async closeTeaching(taskId: string, expectedRevision: number): Promise<RemediationTask> {
    return this.db.transaction('rw', this.db.tables, async () => {
      const task = await this.checkedTask(taskId, expectedRevision);
      await this.requireExclusiveReview(task);
      requireRule(task.phase === 'teaching-open', 'TEACHING_NOT_OPEN');
      task.phase = 'ready'; task.teachingClosedAt = now(); task.revision += 1; task.independencePolicy = 2;
      await this.advanceReviewPeers(task);
      await this.db.remediationTasks.put(task);
      return task;
    });
  }

  async presentRetest(taskId: string, expectedRevision: number) {
    return this.db.transaction('rw', this.db.tables, async () => {
      const task = await this.checkedTask(taskId, expectedRevision);
      requireRule((task.phase === 'ready' || task.phase === 'awaiting-answer') && task.teachingClosedAt, 'TEACHING_MUST_BE_CLOSED');
      if (await this.unsafeRetest(task)) {
        await this.invalidateRetest(task, 'unverified-or-conflicting-teaching');
        return { taskId, revision: task.revision, exhausted: false, invalidated: true, question: undefined };
      }
      await this.requireExclusiveReview(task);
      if (task.phase === 'awaiting-answer') {
        requireRule(task.currentQuestion, 'MISSING_RETEST');
        return { taskId, revision: task.revision, exhausted: false, question: publicQuestion(task.currentQuestion) };
      }
      const shown = new Set((await this.db.exposures.where('runId').equals(task.failureRunId).toArray()).map(e => e.questionFingerprint));
      const words = await this.db.words.where('scope').equals('demo').toArray();
      const objectives = await this.db.objectives.where('scope').equals('demo').toArray();
      const candidates = await this.db.questions.where('[scope+purpose]').equals(['demo', 'retest']).toArray();
      const question = candidates.find(q => q.objectiveId === task.objectiveId && q.wordId === task.wordId && dimensionOf(q.type) === task.dimension && !shown.has(q.fingerprint));
      task.revision += 1;
      await this.advanceReviewPeers(task);
      if (!question) {
        task.phase = 'exhausted';
        await this.db.remediationTasks.put(task);
        return { taskId, revision: task.revision, exhausted: true, question: undefined };
      }
      validateQuestion(question, words, objectives);
      task.currentQuestion = structuredClone(question); task.phase = 'awaiting-answer';
      await this.recordExposure(task.failureRunId, question, 'retest');
      await this.db.remediationTasks.put(task);
      return { taskId, revision: task.revision, exhausted: false, question: publicQuestion(question) };
    });
  }

  async submitRetest(input: { taskId: string; expectedRevision: number; submissionId: string; answer: string; usedHint?: boolean; viewedAnswer?: boolean }) {
    return this.db.transaction('rw', this.db.tables, async () => {
      const prior = await this.db.answers.get(input.submissionId);
      if (prior) {
        requireRule(prior.phase === 'retest' && prior.questionInstanceId === `${input.taskId}:${input.expectedRevision}` && prior.submittedAnswer === input.answer, 'SUBMISSION_ID_REUSED');
        return { kind: 'duplicate' as const };
      }
      const task = await this.checkedTask(input.taskId, input.expectedRevision);
      requireRule(task.phase === 'awaiting-answer' && task.currentQuestion && task.teachingClosedAt, 'NO_ACTIVE_RETEST');
      if (await this.unsafeRetest(task)) {
        await this.invalidateRetest(task, 'unverified-or-conflicting-teaching');
        return { kind: 'invalidated' as const };
      }
      await this.requireExclusiveReview(task);
      if (typeof input.answer !== 'string' || !input.answer.trim()) return { kind: 'ignored' as const };
      const assisted = !!(input.usedHint || input.viewedAnswer);
      const question = task.currentQuestion;
      const correct = normalizeAnswer(input.answer) === normalizeAnswer(question.answer);
      const answer = this.answerRecord(question, task.failureRunId, `${task.taskId}:${task.revision}`, input.submissionId, input.answer, correct, !!input.usedHint, assisted, 'retest');
      answer.settlementKey = answer.questionInstanceId;
      await this.db.answers.add(answer);
      await this.recordEvidence(answer);
      task.revision += 1;
      task.currentQuestion = undefined;
      if (correct && !assisted) { task.phase = 'passed'; task.passedAt = now(); }
      else { task.phase = 'teaching-required'; task.teachingClosedAt = undefined; }
      await this.db.remediationTasks.put(task);
      await this.advanceReviewPeers(task);
      const tasks = await this.db.remediationTasks.where('failureRunId').equals(task.failureRunId).toArray();
      if (tasks.length && tasks.every(t => t.phase === 'passed')) {
        const gate = await this.db.gates.get('demo');
        requireRule(gate?.lockedRunId === task.failureRunId, 'REVIEW_GATE_MISMATCH');
        await this.db.gates.put({ ...gate, lockedRunId: undefined });
      }
      return { kind: task.phase === 'passed' ? 'passed' as const : 'needs-teaching' as const };
    });
  }

  private async requireExclusiveReview(task: RemediationTask): Promise<void> {
    const siblings = await this.db.remediationTasks.where('failureRunId').equals(task.failureRunId).toArray();
    requireRule(!siblings.some(t => t.taskId !== task.taskId && ['teaching-open', 'ready', 'awaiting-answer'].includes(t.phase)), 'REVIEW_SESSION_BUSY');
  }

  private async advanceReviewPeers(task: RemediationTask): Promise<void> {
    const siblings = await this.db.remediationTasks.where('failureRunId').equals(task.failureRunId).toArray();
    for (const other of siblings) if (other.taskId !== task.taskId) {
      other.revision += 1; await this.db.remediationTasks.put(other);
    }
  }

  private async unsafeRetest(task: RemediationTask): Promise<boolean> {
    if (task.independencePolicy !== 2) return true;
    const others = await this.db.remediationTasks.where('failureRunId').equals(task.failureRunId).toArray();
    return others.some(t => t.taskId !== task.taskId && ['teaching-open', 'ready', 'awaiting-answer'].includes(t.phase));
  }

  private async invalidateRetest(task: RemediationTask, reason: string): Promise<void> {
    if (task.currentQuestion) {
      task.invalidatedRetests = [...(task.invalidatedRetests || []), { questionId: task.currentQuestion.questionId, fingerprint: task.currentQuestion.fingerprint, invalidatedAt: now(), reason }];
    }
    task.currentQuestion = undefined; task.phase = 'teaching-required';
    task.teachingClosedAt = undefined; task.independencePolicy = undefined; task.revision += 1;
    await this.db.remediationTasks.put(task);
    await this.advanceReviewPeers(task);
  }

  /** Upgrade legacy pending checks conservatively without deleting evidence or exposures. */
  async reconcileReviewSafety(): Promise<void> {
    await this.db.transaction('rw', this.db.tables, async () => {
      const gate = await this.db.gates.get('demo');
      if (!gate?.lockedRunId) return;
      const tasks = await this.db.remediationTasks.where('failureRunId').equals(gate.lockedRunId).toArray();
      const active = tasks.filter(t => ['teaching-open', 'ready', 'awaiting-answer'].includes(t.phase));
      if (active.length > 1) {
        for (const old of active) await this.invalidateRetest((await this.db.remediationTasks.get(old.taskId))!, 'legacy-conflicting-session');
        return;
      }
      for (const old of tasks) {
        const task = (await this.db.remediationTasks.get(old.taskId))!;
        if (['ready', 'awaiting-answer'].includes(task.phase) && await this.unsafeRetest(task)) await this.invalidateRetest(task, 'legacy-pending-check');
      }
    });
  }

  /** A visible stale teaching card reports a durable, idempotent exposure event. */
  async reportReviewExposure(taskId: string, observedRevision: number): Promise<void> {
    await this.db.transaction('rw', this.db.tables, async () => {
      const source = await this.db.remediationTasks.get(taskId);
      const gate = await this.db.gates.get('demo');
      if (!source || source.scope !== 'demo' || gate?.lockedRunId !== source.failureRunId) return;
      const eventId = `demo:teaching-exposure:${taskId}:${observedRevision}`;
      if (await this.db.metadata.get(eventId)) return;
      await this.db.metadata.add({ id: eventId, scope: 'demo', value: now() });
      for (const old of await this.db.remediationTasks.where('failureRunId').equals(source.failureRunId).toArray()) {
        const target = (await this.db.remediationTasks.get(old.taskId))!;
        if (target.wordId === source.wordId && ['ready', 'awaiting-answer'].includes(target.phase)) await this.invalidateRetest(target, 'stale-teaching-exposure');
      }
    });
  }

  private async checkedTask(taskId: string, revision: number): Promise<RemediationTask> {
    const task = await this.db.remediationTasks.get(taskId);
    requireRule(task && task.scope === 'demo', 'UNKNOWN_REVIEW_TASK');
    const gate = await this.db.gates.get('demo');
    requireRule(gate?.lockedRunId === task.failureRunId, 'NO_REVIEW_LOCK');
    requireRule(task.revision === revision, 'STALE_REVIEW');
    return task;
  }

  private answerRecord(q: Question, runId: string, instanceId: string, answerId: string, raw: string, correct: boolean, usedHint: boolean, assisted: boolean, phase: Answer['phase']): Answer {
    return { answerId, runId, questionInstanceId: instanceId, wordId: q.wordId, objectiveId: q.objectiveId,
      questionId: q.questionId, questionFingerprint: q.fingerprint, contextId: q.contextId,
      questionType: q.type, submittedAnswer: raw, correctAnswer: q.answer,
      isCorrect: correct, usedHint, assisted, timestamp: now(), scope: 'demo', phase };
  }

  private async recordExposure(runId: string, q: Question, phase: 'battle' | 'retest'): Promise<void> {
    await this.db.exposures.add({ id: id(), scope: 'demo', runId, questionFingerprint: q.fingerprint, questionId: q.questionId, objectiveId: q.objectiveId, dimension: dimensionOf(q.type), phase, shownAt: now() });
  }

  private async recordEvidence(answer: Answer): Promise<void> {
    const dimension: Dimension = dimensionOf(answer.questionType);
    await this.db.evidence.add({ evidenceId: id(), answerId: answer.answerId, runId: answer.runId, objectiveId: answer.objectiveId, wordId: answer.wordId, scope: 'demo', dimension, isCorrect: answer.isCorrect, independent: !answer.assisted, timestamp: answer.timestamp });
    const key = `demo:${answer.objectiveId}`;
    const state: LearningState = await this.db.learningStates.get(key) || { id: key, scope: 'demo', objectiveId: answer.objectiveId, status: 'New', dimensions: freshDimensions(), updatedAt: answer.timestamp };
    const counts = state.dimensions[dimension];
    if (answer.assisted) counts.assisted += 1;
    else if (answer.isCorrect) counts.correct += 1;
    else counts.wrong += 1;
    if (!answer.assisted && !answer.isCorrect) {
      state.status = 'Weak';
      await this.db.reviewSchedules.put({ id: `${key}:${dimension}`, scope: 'demo', objectiveId: answer.objectiveId, dimension, dueAt: answer.timestamp });
    } else if (state.status === 'New') state.status = answer.assisted ? 'Learning' : 'Practicing';
    state.updatedAt = answer.timestamp;
    await this.db.learningStates.put(state);
    // Boss success and remediation never manufacture cross-day Mastered evidence.
  }
}
