import { afterEach, beforeEach, expect, it } from 'vitest';
import { WordQuestDB } from '../src/db/database';
import { seedDemo } from '../src/content/demo';
import { GameService } from '../src/services/game';

let db: WordQuestDB;
beforeEach(async () => { db = new WordQuestDB(`wordquest-test-${crypto.randomUUID()}`); await seedDemo(db); });
afterEach(async () => { db.close(); await db.delete(); });

it('an unavailable audio resource prevents any new battle or gate write', async () => {
  const game = new GameService(db, { beforeStart: async () => { throw new Error('missing-local-audio'); } });
  const gate = await db.gates.get('demo');
  await expect(game.startChallenge()).rejects.toThrow('missing-local-audio');
  expect(await db.runs.count()).toBe(0);
  expect(await db.gates.get('demo')).toEqual(gate);
});

it('a teaching card can resume after a refresh without unlocking or skipping it', async () => {
  const game = new GameService(db); await game.setPlayerHp(3);
  const run = await game.startChallenge();
  for (let i = 0; i < 3; i++) {
    const shown = await game.presentBattleQuestion(run.runId);
    await game.submitBattle({ runId: run.runId, submissionId: crypto.randomUUID(), instanceId: shown.instanceId, expectedVersion: shown.run.version, answer: 'wrong' });
  }
  const task = (await db.remediationTasks.toArray())[0];
  const first = await game.beginTeaching(task.taskId, task.revision);
  const resumed = await game.beginTeaching(task.taskId, first.task.revision);
  expect(resumed).toEqual(first);
  await expect(game.presentRetest(task.taskId, resumed.task.revision)).rejects.toThrow('TEACHING_MUST_BE_CLOSED');
  await expect(game.startChallenge()).rejects.toThrow('REVIEW_LOCKED');
});
