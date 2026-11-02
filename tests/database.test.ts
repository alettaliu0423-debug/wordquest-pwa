import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDemo, demoObjectives, demoWords } from '../src/content/demo';
import { SCHEMA_V1, WordQuestDB } from '../src/db/database';
import type { Submission } from '../src/domain/model';
import { GameService } from '../src/services/game';

let db: WordQuestDB;
let game: GameService;
const names: string[] = [];
beforeEach(async () => {
  const name = `wordquest-test-${crypto.randomUUID()}`;
  names.push(name); db = new WordQuestDB(name); game = new GameService(db);
  await seedDemo(db);
});
afterEach(async () => {
  db.close();
  // Only newly allocated, in-memory fake IndexedDB names are removed by this suite.
  for (const name of names.splice(0)) { expect(name.startsWith('wordquest-test-')).toBe(true); await Dexie.delete(name); }
});
async function inputFor(runId: string, correct = true): Promise<Submission> {
  const current = await game.presentBattleQuestion(runId);
  const raw = (await db.runs.get(runId))!;
  return { submissionId: crypto.randomUUID(), runId, instanceId: current.instanceId, expectedVersion: current.run.version, answer: correct ? raw.questionSet[raw.currentQuestionIndex].question.answer : 'incorrect-original-answer' };
}
async function lose(hp = 5) {
  await game.setPlayerHp(hp);
  const run = await game.startChallenge();
  for (let i = 0; i < hp; i++) await game.submitBattle(await inputFor(run.runId, false));
  return (await db.runs.get(run.runId))!;
}
async function prepareTask(taskId: string) {
  let task = (await db.remediationTasks.get(taskId))!;
  if (task.phase === 'teaching-required') task = (await game.beginTeaching(taskId, task.revision)).task;
  if (task.phase === 'teaching-open') task = await game.closeTeaching(taskId, task.revision);
  return game.presentRetest(taskId, task.revision);
}
async function passTask(taskId: string) {
  const shown = await prepareTask(taskId);
  const task = (await db.remediationTasks.get(taskId))!;
  return game.submitRetest({ taskId, expectedRevision: shown.revision, submissionId: crypto.randomUUID(), answer: task.currentQuestion!.answer });
}

describe('battle transactions', () => {
  it('seeds idempotently and rejects practice or real challenges explicitly', async () => {
    await Promise.all([seedDemo(db), seedDemo(db)]);
    expect(await db.questions.count()).toBe(42);
    await expect(game.startChallenge({ mode: 'practice' })).rejects.toThrow('PRACTICE_NOT_AVAILABLE');
    await expect(game.startChallenge({ scope: 'real' })).rejects.toThrow('REAL_CHALLENGES_NOT_AVAILABLE');
    expect(await db.runs.count()).toBe(0);
  });
  it('starts with default HP 5, boss HP 8 and a full immutable question snapshot', async () => {
    const run = await game.startChallenge();
    expect(run).toMatchObject({ initialHp: 5, currentHp: 5, bossInitialHp: 8, bossCurrentHp: 8, maxQuestionCount: 12, status: 'active' });
    expect((await db.runs.get(run.runId))!.questionSet).toHaveLength(12);
    expect(run).not.toHaveProperty('questionSet');
    await expect(game.startChallenge()).rejects.toThrow('ACTIVE_RUN_EXISTS');
  });
  it.each([3, 5, 7, 10])('fails immediately on effective error %s and locks retry', async hp => {
    await game.setPlayerHp(hp); const run = await game.startChallenge();
    for (let i = 1; i <= hp; i++) {
      const result = await game.submitBattle(await inputFor(run.runId, false));
      expect(result.run.currentHp).toBe(hp - i);
      expect(result.run.status).toBe(i === hp ? 'lost' : 'active');
    }
    await expect(game.startChallenge()).rejects.toThrow('REVIEW_LOCKED');
    expect((await db.gates.get('demo'))!.lockedRunId).toBe(run.runId);
    expect(await db.answers.count()).toBe(hp);
    expect(await db.evidence.count()).toBe(hp);
  });
  it.each([3, 5, 7, 10])('wins after eight independent correct answers at HP %s', async hp => {
    await game.setPlayerHp(hp); const run = await game.startChallenge(); let last: Submission | undefined;
    for (let i = 1; i <= 8; i++) {
      last = await inputFor(run.runId); const result = await game.submitBattle(last);
      expect(result.run.bossCurrentHp).toBe(8 - i);
      expect(result.run.status).toBe(i === 8 ? 'won' : 'active');
    }
    expect(await db.rewards.count()).toBe(1);
    expect((await db.gameProgress.get('demo'))!.crystalIds).toEqual(['forest-crystal']);
    expect((await db.learningStates.toArray()).every(s => s.status !== 'Mastered')).toBe(true);
    expect((await game.submitBattle(last!)).kind).toBe('duplicate');
    expect(await db.rewards.count()).toBe(1);
    expect(await db.storyProgress.count()).toBe(1);
    const types = (await db.answers.toArray()).map(a => a.questionType);
    expect(types.filter(t => t === 'meaning-spell')).toHaveLength(2);
    expect(types.filter(t => t === 'listen-spell')).toHaveLength(2);
  });
  it('uses exactly 12 effective questions in the 5 HP boundary case', async () => {
    const run = await game.startChallenge();
    for (let i = 0; i < 12; i++) await game.submitBattle(await inputFor(run.runId, i >= 4));
    expect(await db.runs.get(run.runId)).toMatchObject({ status: 'won', currentHp: 1, bossCurrentHp: 0, effectiveAnswerCount: 12 });
  });
  it('settings cannot change the active HP snapshot; invalid values cannot overwrite settings', async () => {
    const run = await game.startChallenge();
    await game.submitBattle(await inputFor(run.runId, false));
    await game.submitBattle(await inputFor(run.runId, false));
    await game.setPlayerHp(7);
    expect(await db.runs.get(run.runId)).toMatchObject({ initialHp: 5, currentHp: 3, bossCurrentHp: 8 });
    for (const invalid of [2, 11, 3.2, '', NaN, Infinity, '7', null]) await expect(game.setPlayerHp(invalid)).rejects.toThrow('INVALID_HP');
    expect((await db.settings.get('demo'))!.playerHp).toBe(7);
  });
  it('empty, unseen, wrong-instance and stale submissions do not damage or settle', async () => {
    const run = await game.startChallenge();
    const unseen = (await db.runs.get(run.runId))!;
    expect((await game.submitBattle({ submissionId: crypto.randomUUID(), runId: run.runId, instanceId: unseen.questionSet[0].instanceId, expectedVersion: 0, answer: 'wrong' })).kind).toBe('ignored');
    const input = await inputFor(run.runId, false);
    expect((await game.submitBattle({ ...input, answer: '   ' })).kind).toBe('ignored');
    expect((await game.submitBattle({ ...input, instanceId: 'an-old-page' })).kind).toBe('ignored');
    expect((await game.submitBattle({ ...input, expectedVersion: 0 })).kind).toBe('ignored');
    expect(await db.runs.get(run.runId)).toMatchObject({ currentHp: 5, bossCurrentHp: 8, effectiveAnswerCount: 0 });
    expect(await db.answers.count()).toBe(0);
  });
  it('duplicate clicks and competing tabs settle one question only', async () => {
    const run = await game.startChallenge(); const input = await inputFor(run.runId, false);
    const results = await Promise.all([game.submitBattle(input), game.submitBattle(input)]);
    expect(results.map(r => r.kind).sort()).toEqual(['duplicate', 'settled']);
    expect(await db.answers.count()).toBe(1);
    const other = new WordQuestDB(db.name); const otherGame = new GameService(other);
    try {
      const next = await inputFor(run.runId, false);
      const competing = await Promise.all([game.submitBattle(next), otherGame.submitBattle({ ...next, submissionId: crypto.randomUUID() })]);
      expect(competing.filter(r => r.kind === 'settled')).toHaveLength(1);
      expect(competing.filter(r => r.kind === 'ignored')).toHaveLength(1);
    } finally { other.close(); }
    expect(await db.runs.get(run.runId)).toMatchObject({ currentHp: 3, effectiveAnswerCount: 2 });
    expect(await db.evidence.count()).toBe(2);
  });
  it('assistance is persisted and cannot be re-labelled as independent success', async () => {
    const run = await game.startChallenge(); const input = await inputFor(run.runId);
    const assisted = await game.submitBattle({ ...input, usedHint: true });
    expect(assisted).toMatchObject({ kind: 'assisted', run: { currentHp: 5, bossCurrentHp: 8, effectiveAnswerCount: 0 } });
    const second = { ...input, submissionId: crypto.randomUUID(), expectedVersion: assisted.run.version };
    expect((await game.submitBattle(second)).reason).toBe('assisted-instance-needs-replacement');
    expect((await db.evidence.toArray())[0].independent).toBe(false);
    expect((await db.learningStates.toArray())[0].dimensions.meaning).toEqual({ correct: 0, wrong: 0, assisted: 1 });
  });
  it('question display and HP survive closing and reopening the database', async () => {
    const run = await game.startChallenge(); const input = await inputFor(run.runId, false);
    await game.submitBattle(input);
    const next = await game.presentBattleQuestion(run.runId);
    const exposures = await db.exposures.count(); const snapshot = await db.runs.get(run.runId);
    const name = db.name; db.close(); db = new WordQuestDB(name); game = new GameService(db);
    expect(await db.runs.get(run.runId)).toEqual(snapshot);
    expect((await game.presentBattleQuestion(run.runId)).instanceId).toBe(next.instanceId);
    expect(await db.exposures.count()).toBe(exposures);
    expect(await db.runs.get(run.runId)).toMatchObject({ currentHp: 4 });
  });
  it('answers remain raw and are not exposed in the formal question DTO', async () => {
    const run = await game.startChallenge(); const shown = await game.presentBattleQuestion(run.runId);
    expect(shown.question).not.toHaveProperty('answer');
    expect(shown.question).not.toHaveProperty('fingerprint');
    const input = await inputFor(run.runId, false); input.answer = 'crsytal';
    await game.submitBattle(input);
    expect((await db.answers.get(input.submissionId))!.submittedAnswer).toBe('crsytal');
    await game.submitBattle(await inputFor(run.runId));
    expect((await db.answers.get(input.submissionId))!.submittedAnswer).toBe('crsytal');
  });
  it('insufficient questions refuse start without partial run or gate writes', async () => {
    await db.questions.where('[scope+purpose]').equals(['demo', 'battle']).delete();
    const gate = await db.gates.get('demo');
    await expect(game.startChallenge()).rejects.toThrow('INSUFFICIENT_UNIQUE_QUESTIONS');
    expect(await db.runs.count()).toBe(0); expect(await db.gates.get('demo')).toEqual(gate);
  });
  it('a skill-evidence write failure rolls back the raw answer and HP', async () => {
    const run = await game.startChallenge(); const input = await inputFor(run.runId, false);
    const snapshot = await db.runs.get(run.runId);
    db.evidence.hook('creating', () => { throw new Error('injected-write-failure'); });
    await expect(game.submitBattle(input)).rejects.toThrow('injected-write-failure');
    expect(await db.answers.count()).toBe(0); expect(await db.evidence.count()).toBe(0);
    expect(await db.learningStates.count()).toBe(0); expect(await db.runs.get(run.runId)).toEqual(snapshot);
  });
  it('a second victory cannot mint a duplicate crystal or story unlock', async () => {
    for (let battle = 0; battle < 2; battle++) {
      const run = await game.startChallenge();
      for (let i = 0; i < 8; i++) await game.submitBattle(await inputFor(run.runId));
    }
    expect(await db.runs.count()).toBe(2);
    expect(await db.answers.count()).toBe(16);
    expect(await db.rewards.count()).toBe(1);
    expect(await db.storyProgress.count()).toBe(1);
    expect((await db.gameProgress.get('demo'))!.crystalIds).toEqual(['forest-crystal']);
  });
  it('failure-lock write errors roll back the fatal answer, HP and all review tasks', async () => {
    await game.setPlayerHp(3); const run = await game.startChallenge();
    for (let i = 0; i < 2; i++) await game.submitBattle(await inputFor(run.runId, false));
    const input = await inputFor(run.runId, false); const snapshot = await db.runs.get(run.runId);
    db.remediationTasks.hook('creating', () => { throw new Error('injected-lock-failure'); });
    await expect(game.submitBattle(input)).rejects.toThrow('injected-lock-failure');
    expect(await db.runs.get(run.runId)).toEqual(snapshot);
    expect(await db.answers.count()).toBe(2); expect(await db.remediationTasks.count()).toBe(0);
    expect((await db.gates.get('demo'))!.lockedRunId).toBeUndefined();
  });
  it('reward failure rolls back the winning hit and does not grant partial progress', async () => {
    const run = await game.startChallenge();
    for (let i = 0; i < 7; i++) await game.submitBattle(await inputFor(run.runId));
    const input = await inputFor(run.runId); const snapshot = await db.runs.get(run.runId);
    db.rewards.hook('creating', () => { throw new Error('injected-reward-failure'); });
    await expect(game.submitBattle(input)).rejects.toThrow('injected-reward-failure');
    expect(await db.runs.get(run.runId)).toEqual(snapshot);
    expect(await db.answers.count()).toBe(7); expect(await db.rewards.count()).toBe(0);
    expect((await db.gameProgress.get('demo'))!.crystalIds).toEqual([]);
  });
});

describe('mandatory review and scope isolation', () => {
  it('initial content failure rolls back all seed writes instead of leaving partial content', async () => {
    const name = `wordquest-test-${crypto.randomUUID()}`;
    names.push(name); const empty = new WordQuestDB(name);
    empty.questions.hook('creating', () => { throw new Error('injected-seed-failure'); });
    try {
      await expect(seedDemo(empty)).rejects.toThrow('injected-seed-failure');
      expect(await empty.words.count()).toBe(0);
      expect(await empty.sources.count()).toBe(0);
      expect(await empty.objectives.count()).toBe(0);
      expect(await empty.metadata.count()).toBe(0);
      expect(await empty.settings.count()).toBe(0);
    } finally { empty.close(); }
  });
  it('deduplicates tasks by failed run, objective and dimension; none cancels another', async () => {
    const run = await lose(10);
    const tasks = await db.remediationTasks.where('failureRunId').equals(run.runId).toArray();
    expect(tasks).toHaveLength(6);
    expect(new Set(tasks.map(t => `${t.failureRunId}:${t.objectiveId}:${t.dimension}`)).size).toBe(6);
    await passTask(tasks[0].taskId);
    await expect(game.startChallenge()).rejects.toThrow('REVIEW_LOCKED');
    expect((await db.remediationTasks.toArray()).filter(t => t.phase === 'passed')).toHaveLength(1);
  });
  it('requires teaching to close, then an independent new retest', async () => {
    const run = await lose(3); const task = (await db.remediationTasks.where('failureRunId').equals(run.runId).toArray()).find(t => t.dimension === 'spelling')!;
    await expect(game.presentRetest(task.taskId, task.revision)).rejects.toThrow('TEACHING_MUST_BE_CLOSED');
    const teaching = await game.beginTeaching(task.taskId, task.revision);
    await expect(game.presentRetest(task.taskId, teaching.task.revision)).rejects.toThrow('TEACHING_MUST_BE_CLOSED');
    const closed = await game.closeTeaching(task.taskId, teaching.task.revision);
    const shown = await game.presentRetest(task.taskId, closed.revision);
    expect(shown.question).not.toHaveProperty('answer');
    const exposures = await db.exposures.where('runId').equals(run.runId).toArray();
    expect(new Set(exposures.map(e => e.questionFingerprint)).size).toBe(exposures.length);
    const answer = (await db.remediationTasks.get(task.taskId))!.currentQuestion!.answer;
    expect(await game.submitRetest({ taskId: task.taskId, expectedRevision: shown.revision, submissionId: crypto.randomUUID(), answer, usedHint: true })).toEqual({ kind: 'needs-teaching' });
    expect((await db.remediationTasks.get(task.taskId))!.phase).toBe('teaching-required');
    const next = await prepareTask(task.taskId);
    expect(next.question!.questionId).not.toBe(shown.question!.questionId);
    await expect(game.startChallenge()).rejects.toThrow('REVIEW_LOCKED');
  });
  it('persists shown retests across reopen, and rejects old-page review submissions', async () => {
    await lose(3); const task = (await db.remediationTasks.toArray())[0];
    const shown = await prepareTask(task.taskId); const count = await db.exposures.count();
    const name = db.name; db.close(); db = new WordQuestDB(name); game = new GameService(db);
    const resumed = await game.presentRetest(task.taskId, shown.revision);
    expect(resumed).toEqual(shown); expect(await db.exposures.count()).toBe(count);
    await expect(game.submitRetest({ taskId: task.taskId, expectedRevision: shown.revision - 1, submissionId: crypto.randomUUID(), answer: 'crystal' })).rejects.toThrow('STALE_REVIEW');
  });
  it('does not auto-pass after three wrong retests; exhaustion retains the lock', async () => {
    await lose(3); const task = (await db.remediationTasks.toArray())[0];
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const shown = await prepareTask(task.taskId); seen.add(shown.question!.questionId);
      await game.submitRetest({ taskId: task.taskId, expectedRevision: shown.revision, submissionId: crypto.randomUUID(), answer: 'wrong-retained-answer' });
    }
    expect(seen.size).toBe(3);
    const exhausted = await prepareTask(task.taskId);
    expect(exhausted.exhausted).toBe(true);
    expect((await db.remediationTasks.get(task.taskId))!.phase).toBe('exhausted');
    await expect(game.startChallenge()).rejects.toThrow('REVIEW_LOCKED');
    expect(await db.answers.filter(a => a.phase === 'retest' && a.submittedAnswer === 'wrong-retained-answer').count()).toBe(3);
  });
  it('all review tasks unlock a new full-health run with different contexts and unchanged history', async () => {
    const failed = await lose(5); await game.setPlayerHp(7);
    const originalErrors = await db.answers.toArray();
    const tasks = await db.remediationTasks.toArray();
    for (const task of tasks) await passTask(task.taskId);
    const retry = await game.startChallenge();
    expect(retry).toMatchObject({ currentHp: 7, initialHp: 7, bossCurrentHp: 8, maxQuestionCount: 14 });
    expect(retry.runId).not.toBe(failed.runId);
    expect(await db.runs.get(failed.runId)).toEqual(failed);
    for (const error of originalErrors) expect(await db.answers.get(error.answerId)).toEqual(error);
    const questions = (await db.runs.get(retry.runId))!.questionSet;
    expect(questions.slice(0, 8).every((q, i) => q.question.fingerprint !== failed.questionSet[i].question.fingerprint)).toBe(true);
    expect((await db.learningStates.toArray()).some(s => s.status === 'Mastered')).toBe(false);
  });
  it('a review evidence write failure preserves the pending question and lock', async () => {
    await lose(3); const task = (await db.remediationTasks.toArray())[0]; const shown = await prepareTask(task.taskId);
    const snapshot = await db.remediationTasks.get(task.taskId); const original = await db.answers.count();
    db.evidence.hook('creating', () => { throw new Error('injected-review-failure'); });
    await expect(game.submitRetest({ taskId: task.taskId, expectedRevision: shown.revision, submissionId: crypto.randomUUID(), answer: snapshot!.currentQuestion!.answer })).rejects.toThrow('injected-review-failure');
    expect(await db.remediationTasks.get(task.taskId)).toEqual(snapshot); expect(await db.answers.count()).toBe(original);
    await expect(game.startChallenge()).rejects.toThrow('REVIEW_LOCKED');
  });
  it('demo events do not alter real words, independent meanings or real progress', async () => {
    const realWord = { ...demoWords[0], wordId: 'real:crystal', scope: 'real' as const, sourceIds: ['real:parent'] };
    const realObjective = { ...demoObjectives[0], objectiveId: 'real:crystal:meaning', wordId: realWord.wordId, sourceId: 'real:parent', scope: 'real' as const };
    await db.words.add(realWord); await db.objectives.add(realObjective);
    await db.gameProgress.add({ scope: 'real', crystalIds: ['real-sentinel'], unlockedDemoAreas: [] });
    await db.objectives.add({ ...demoObjectives[0], objectiveId: 'demo:crystal:another-meaning' });
    const realProgress = await db.gameProgress.get('real'); const run = await game.startChallenge();
    for (let i = 0; i < 8; i++) await game.submitBattle(await inputFor(run.runId));
    expect(await db.words.get(realWord.wordId)).toEqual(realWord);
    expect(await db.objectives.get(realObjective.objectiveId)).toEqual(realObjective);
    expect(await db.gameProgress.get('real')).toEqual(realProgress);
    expect(await db.learningStates.where('scope').equals('real').count()).toBe(0);
    expect(await db.learningStates.where('[scope+objectiveId]').equals(['demo', 'demo:crystal:another-meaning']).count()).toBe(0);
    expect((await db.answers.toArray()).every(a => a.scope === 'demo')).toBe(true);
    expect((await db.rewards.toArray()).every(a => a.scope === 'demo')).toBe(true);
  });
  it('deduplicates spellings per scope while allowing a separately scoped real word', async () => {
    await expect(db.words.add({ ...demoWords[0], wordId: 'demo:duplicate' })).rejects.toThrow();
    await expect(db.words.add({ ...demoWords[0], wordId: 'real:same-spelling', scope: 'real' })).resolves.toBeDefined();
    expect(await db.words.where('[scope+normalizedWord]').equals(['demo', 'crystal']).count()).toBe(1);
  });
  it('failed schema migration leaves existing content and version intact', async () => {
    const name = db.name; const original = await db.questions.toArray(); db.close();
    const failing = new Dexie(name); failing.version(1).stores(SCHEMA_V1);
    failing.version(2).stores({ metadata: 'id, scope, value' }).upgrade(async tx => {
      await tx.table('metadata').put({ id: 'migration-test', scope: 'demo', value: 'must-rollback' });
      throw new Error('injected-migration-failure');
    });
    await expect(failing.open()).rejects.toThrow('injected-migration-failure'); failing.close();
    db = new WordQuestDB(name); await db.open();
    expect(db.verno).toBe(1); expect(await db.questions.toArray()).toEqual(original);
    expect(await db.metadata.get('migration-test')).toBeUndefined();
    expect(await db.metadata.get('demo:content:1')).toBeDefined();
  });
});
