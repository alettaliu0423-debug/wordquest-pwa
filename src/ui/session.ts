import { db } from '../db/runtime';
import { battleView, type BattleView } from '../services/game';
import type { BattleGate, GameProgress, LearningState, Objective, RemediationTask, SafeQuestion, Word } from '../domain/model';
import { publicQuestion } from '../domain/model';

export type ReviewTaskView = Omit<RemediationTask, 'currentQuestion' | 'invalidatedRetests'> & { currentQuestion?: SafeQuestion };
export interface Library {
  words: Word[]; objectives: Objective[]; states: LearningState[]; progress?: GameProgress;
  gate?: BattleGate; runs: BattleView[]; tasks: ReviewTaskView[];
}

export async function readLibrary(): Promise<Library> {
  return {
    words: await db.words.where('scope').equals('demo').toArray(),
    objectives: await db.objectives.where('scope').equals('demo').toArray(),
    states: await db.learningStates.where('scope').equals('demo').toArray(),
    progress: await db.gameProgress.get('demo'), gate: await db.gates.get('demo'),
    runs: (await db.runs.where('scope').equals('demo').toArray()).map(battleView).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    tasks: (await db.remediationTasks.where('scope').equals('demo').toArray()).map(task => {
      const { invalidatedRetests: _audit, currentQuestion, ...view } = task;
      return { ...view, currentQuestion: currentQuestion && publicQuestion(currentQuestion) };
    }),
  };
}
export function goBattle(runId: string) { location.hash = `/battle/${encodeURIComponent(runId)}`; }
export function goReview(runId: string) { location.hash = `/review/${encodeURIComponent(runId)}`; }
