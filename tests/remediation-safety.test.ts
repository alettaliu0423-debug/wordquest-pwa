import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedDemo } from '../src/content/demo';
import { WordQuestDB } from '../src/db/database';
import { GameService } from '../src/services/game';

let db: WordQuestDB;
let game: GameService;
beforeEach(async () => {
  db = new WordQuestDB(`wordquest-fix-${crypto.randomUUID()}`);
  game = new GameService(db); await seedDemo(db);
  const run = await game.startChallenge();
  for (let i = 0; i < 5; i++) {
    const shown = await game.presentBattleQuestion(run.runId);
    await game.submitBattle({ runId: run.runId, instanceId: shown.instanceId, expectedVersion: shown.run.version, submissionId: crypto.randomUUID(), answer: 'wrong' });
  }
});
afterEach(async () => { await db.delete(); }); // This suite only owns newly allocated fake IndexedDBs.
async function startSpelling() {
  const task = (await db.remediationTasks.toArray()).find(t => t.dimension === 'spelling')!;
  const teaching = await game.beginTeaching(task.taskId, task.revision);
  const closed = await game.closeTeaching(task.taskId, teaching.task.revision);
  return { task, shown: await game.presentRetest(task.taskId, closed.revision) };
}

it('blocks a different task teaching during an independent spelling check, including another connection', async () => {
  await startSpelling();
  const other = new WordQuestDB(db.name); const otherGame = new GameService(other);
  try {
    const target = (await other.remediationTasks.toArray()).find(t => t.dimension === 'context')!;
    await expect(otherGame.beginTeaching(target.taskId, target.revision)).rejects.toThrow('REVIEW_SESSION_BUSY');
  } finally { other.close(); }
  expect((await db.remediationTasks.toArray()).filter(t => t.phase === 'awaiting-answer')).toHaveLength(1);
});

it('serializes concurrent teaching requests and invalidates cross-task stale revisions', async () => {
  const tasks = await db.remediationTasks.toArray();
  const results = await Promise.allSettled(tasks.slice(0, 2).map(t => game.beginTeaching(t.taskId, t.revision)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((await db.remediationTasks.toArray()).filter(t => t.phase === 'teaching-open')).toHaveLength(1);
  const stale = tasks[1];
  await expect(game.beginTeaching(stale.taskId, stale.revision)).rejects.toThrow('STALE_REVIEW');
});

it('never credits an unverified legacy pending retest; keeps its exposure and allocates a fresh question', async () => {
  const { task, shown } = await startSpelling();
  const pending = (await db.remediationTasks.get(task.taskId))!;
  // Simulate a record created by the previous implementation, without a safety stamp.
  const legacy = { ...pending } as typeof pending & { independencePolicy?: number };
  delete legacy.independencePolicy; await db.remediationTasks.put(legacy);
  const originalErrors = await db.answers.toArray(); const exposures = await db.exposures.toArray();
  const result = await game.submitRetest({ taskId: task.taskId, expectedRevision: shown.revision, submissionId: crypto.randomUUID(), answer: pending.currentQuestion!.answer });
  expect(result.kind).toBe('invalidated');
  expect(await db.answers.toArray()).toEqual(originalErrors);
  expect(await db.exposures.toArray()).toEqual(exposures);
  expect((await db.gates.get('demo'))!.lockedRunId).toBe(task.failureRunId);
  const latest = (await db.remediationTasks.get(task.taskId))!;
  const teaching = await game.beginTeaching(task.taskId, latest.revision);
  const closed = await game.closeTeaching(task.taskId, teaching.task.revision);
  const next = await game.presentRetest(task.taskId, closed.revision);
  expect(next.question!.questionId).not.toBe(shown.question!.questionId);
});

it('an explicitly exposed retest remains assisted and can never release the lock', async () => {
  const { task, shown } = await startSpelling();
  const pending = (await db.remediationTasks.get(task.taskId))!;
  const submissionId = crypto.randomUUID();
  await game.submitRetest({ taskId: task.taskId, expectedRevision: shown.revision, submissionId, answer: pending.currentQuestion!.answer, viewedAnswer: true });
  expect((await db.remediationTasks.get(task.taskId))!.phase).toBe('teaching-required');
  expect((await db.answers.get(submissionId))?.assisted).toBe(true);
  expect((await db.gates.get('demo'))!.lockedRunId).toBe(task.failureRunId);
});

it('a stale teaching exposure invalidates the pending check durably and only once', async () => {
  const { task, shown } = await startSpelling();
  const errors = await db.answers.toArray(); const exposures = await db.exposures.toArray();
  await game.reportReviewExposure(task.taskId, 1);
  const invalid = (await db.remediationTasks.get(task.taskId))!;
  expect(invalid.phase).toBe('teaching-required');
  expect(invalid.invalidatedRetests).toHaveLength(1);
  await game.reportReviewExposure(task.taskId, 1);
  expect(await db.remediationTasks.get(task.taskId)).toEqual(invalid);
  await expect(game.submitRetest({ taskId: task.taskId, expectedRevision: shown.revision, submissionId: crypto.randomUUID(), answer: 'crystal' })).rejects.toThrow('STALE_REVIEW');
  expect(await db.answers.toArray()).toEqual(errors); expect(await db.exposures.toArray()).toEqual(exposures);
});

it('reconciles conflicting legacy tasks without clearing original failures or exposures', async () => {
  const { task } = await startSpelling();
  const other = (await db.remediationTasks.toArray()).find(t => t.dimension === 'context')!;
  await db.remediationTasks.put({ ...other, phase: 'teaching-open' });
  const errors = await db.answers.toArray(); const exposures = await db.exposures.toArray();
  await game.reconcileReviewSafety();
  const pending = (await db.remediationTasks.get(task.taskId))!;
  expect(pending.phase).toBe('teaching-required'); expect(pending.invalidatedRetests).toHaveLength(1);
  expect((await db.remediationTasks.toArray()).some(t => t.phase === 'teaching-open')).toBe(false);
  expect(await db.answers.toArray()).toEqual(errors); expect(await db.exposures.toArray()).toEqual(exposures);
});

it('an invalidation-write failure rolls back the audit, metadata and task revision together', async () => {
  const { task, shown } = await startSpelling();
  const before = await db.remediationTasks.toArray(); const metadata = await db.metadata.toArray();
  const fail = () => { throw new Error('invalidation-failure'); };
  db.remediationTasks.hook('updating', fail);
  await expect(game.reportReviewExposure(task.taskId, shown.revision)).rejects.toThrow('invalidation-failure');
  db.remediationTasks.hook('updating').unsubscribe(fail);
  expect(await db.remediationTasks.toArray()).toEqual(before); expect(await db.metadata.toArray()).toEqual(metadata);
  expect((await db.gates.get('demo'))!.lockedRunId).toBe(task.failureRunId);
});

it('concurrent retest submissions settle once and keep old battle errors intact', async () => {
  const { task, shown } = await startSpelling(); const errors = await db.answers.toArray();
  const input = { taskId: task.taskId, expectedRevision: shown.revision, submissionId: crypto.randomUUID(), answer: 'crystal' };
  const results = await Promise.all([game.submitRetest(input), game.submitRetest(input)]);
  expect(results.map(r => r.kind).sort()).toEqual(['duplicate', 'passed']);
  for (const error of errors) expect(await db.answers.get(error.answerId)).toEqual(error);
  expect(await db.answers.count()).toBe(errors.length + 1);
});
