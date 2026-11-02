import Dexie, { type EntityTable } from 'dexie';
import type {
  Answer, BattleGate, BattleRun, Evidence, Exposure, GameProgress, LearningState, Metadata,
  MorphologyRelation, Objective, Question, RemediationTask, Reward, ReviewSchedule,
  Settings, Source, StoryProgress, Word,
} from '../domain/model';

export const DATABASE_NAME = 'wordquest-official-v1';
export const SCHEMA_V1 = {
  sources: 'sourceId, scope',
  words: 'wordId, &[scope+normalizedWord], scope, *sourceIds',
  objectives: 'objectiveId, [scope+wordId], scope, sourceId',
  morphology: 'relationId, [scope+wordId], scope, reviewed',
  questions: 'questionId, &[scope+fingerprint], [scope+purpose], [scope+objectiveId], scope',
  runs: 'runId, [scope+status], scope',
  answers: 'answerId, &[runId+settlementKey], runId, [scope+objectiveId], scope',
  evidence: 'evidenceId, &answerId, runId, [scope+objectiveId], scope',
  learningStates: 'id, &[scope+objectiveId], scope',
  reviewSchedules: 'id, [scope+dueAt], scope',
  exposures: 'id, &[scope+runId+questionFingerprint], runId, scope',
  remediationTasks: 'taskId, &[failureRunId+objectiveId+dimension], failureRunId, scope',
  gates: 'scope', settings: 'scope', rewards: 'rewardId, scope, runId',
  gameProgress: 'scope', storyProgress: 'id, scope', metadata: 'id, scope',
} as const;

export class WordQuestDB extends Dexie {
  sources!: EntityTable<Source, 'sourceId'>;
  words!: EntityTable<Word, 'wordId'>;
  objectives!: EntityTable<Objective, 'objectiveId'>;
  morphology!: EntityTable<MorphologyRelation, 'relationId'>;
  questions!: EntityTable<Question, 'questionId'>;
  runs!: EntityTable<BattleRun, 'runId'>;
  answers!: EntityTable<Answer, 'answerId'>;
  evidence!: EntityTable<Evidence, 'evidenceId'>;
  learningStates!: EntityTable<LearningState, 'id'>;
  reviewSchedules!: EntityTable<ReviewSchedule, 'id'>;
  exposures!: EntityTable<Exposure, 'id'>;
  remediationTasks!: EntityTable<RemediationTask, 'taskId'>;
  gates!: EntityTable<BattleGate, 'scope'>;
  settings!: EntityTable<Settings, 'scope'>;
  rewards!: EntityTable<Reward, 'rewardId'>;
  gameProgress!: EntityTable<GameProgress, 'scope'>;
  storyProgress!: EntityTable<StoryProgress, 'id'>;
  metadata!: EntityTable<Metadata, 'id'>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    // Future migrations must use Dexie version upgrades; never recover by deleting a database.
  }
}
