import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedDemo } from '../src/content/demo';
import { WordQuestDB } from '../src/db/database';
import { GameService } from '../src/services/game';
let db: WordQuestDB; let game: GameService;
beforeEach(async () => { db = new WordQuestDB(`wordquest-assist-${crypto.randomUUID()}`); game = new GameService(db); await seedDemo(db); });
afterEach(async () => { await db.delete(); });
it('replaces assisted questions atomically without HP or progress changes; preserves required type and history', async () => {
  const run = await game.startChallenge(); const first = await game.presentBattleQuestion(run.runId);
  const input = { runId: run.runId, instanceId: first.instanceId, expectedVersion: first.run.version, submissionId: crypto.randomUUID(), answer: 'crystal', usedHint: true };
  await game.submitBattle(input);
  const resumed = await game.presentBattleQuestion(run.runId);
  expect(resumed.run).toMatchObject({ currentHp: 5, bossCurrentHp: 8, currentQuestionIndex: 0, effectiveAnswerCount: 0 });
  expect(resumed.instanceId).not.toBe(first.instanceId);
  expect(resumed.question.type).toBe(first.question.type);
  expect(resumed.question.questionId).not.toBe(first.question.questionId);
  expect((await game.submitBattle({ ...input, submissionId: crypto.randomUUID(), usedHint: false })).kind).toBe('ignored');
  expect((await db.runs.get(run.runId))!.retiredQuestions![0].assisted).toBe(true);
  expect(await db.answers.get(input.submissionId)).toMatchObject({ assisted: true });
  expect(await db.exposures.count()).toBe(2);
  expect(await game.presentBattleQuestion(run.runId)).toEqual(resumed);
  for (let i = 0; i < 8; i++) {
    const shown = await game.presentBattleQuestion(run.runId);
    const snapshot = (await db.runs.get(run.runId))!;
    await game.submitBattle({ runId: run.runId, instanceId: shown.instanceId, expectedVersion: shown.run.version, submissionId: crypto.randomUUID(), answer: snapshot.questionSet[snapshot.currentQuestionIndex].question.answer });
  }
  expect(await db.runs.get(run.runId)).toMatchObject({ status: 'won', effectiveAnswerCount: 8, currentHp: 5 });
  expect(await db.rewards.count()).toBe(1);
});
it('two connections replace once and observe one stable instance', async () => {
  const run = await game.startChallenge(); const first = await game.presentBattleQuestion(run.runId);
  await game.submitBattle({ runId: run.runId, instanceId: first.instanceId, expectedVersion: first.run.version, submissionId: crypto.randomUUID(), answer: 'crystal', viewedAnswer: true });
  const other = new WordQuestDB(db.name);
  try {
    const views = await Promise.all([game.presentBattleQuestion(run.runId), new GameService(other).presentBattleQuestion(run.runId)]);
    expect(views[0]).toEqual(views[1]); expect((await db.runs.get(run.runId))!.retiredQuestions).toHaveLength(1);
  } finally { other.close(); }
});
it('exhaustion leaves the active run paused; an injected archive-write failure rolls back replacement', async () => {
  const run = await game.startChallenge(); const first = await game.presentBattleQuestion(run.runId);
  await game.submitBattle({ runId: run.runId, instanceId: first.instanceId, expectedVersion: first.run.version, submissionId: crypto.randomUUID(), answer: 'crystal', usedHint: true });
  const before = await db.runs.get(run.runId); const exposureCount = await db.exposures.count();
  const fail = () => { throw new Error('replacement-write-failure'); };
  db.runs.hook('updating', fail);
  await expect(game.presentBattleQuestion(run.runId)).rejects.toThrow('replacement-write-failure');
  db.runs.hook('updating').unsubscribe(fail);
  expect(await db.runs.get(run.runId)).toEqual(before); expect(await db.exposures.count()).toBe(exposureCount);
  // Exhaust only this suite's in-memory content; never touch an existing browser database.
  await db.questions.where('[scope+purpose]').equals(['demo', 'battle']).filter(q => q.type === first.question.type && q.objectiveId === first.question.objectiveId).delete();
  await expect(game.presentBattleQuestion(run.runId)).rejects.toThrow('ASSISTED_REPLACEMENT_EXHAUSTED');
  expect(await db.runs.get(run.runId)).toEqual(before); expect(await db.rewards.count()).toBe(0);
});
