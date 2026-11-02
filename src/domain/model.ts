export type Scope = 'demo' | 'real';
export type Dimension = 'meaning' | 'context' | 'spelling' | 'wordFormation';
export type QuestionType = 'meaning-match' | 'context-challenge' | 'listen-spell' | 'meaning-spell' | 'word-formation';
export type LearningStatus = 'New' | 'Learning' | 'Practicing' | 'Weak' | 'Review Due' | 'Provisional Mastery' | 'Mastered';

export interface Source {
  sourceId: string; scope: Scope; title: string; kind: 'original-demo' | 'parent-import';
}
export interface Word {
  wordId: string; headword: string; normalizedWord: string; pronunciation?: string;
  audioRef?: string; partOfSpeech: string; imageRef?: string; sourceIds: string[];
  scope: Scope; createdAt: string; updatedAt: string;
}
export interface Objective {
  objectiveId: string; wordId: string; definition: string; exampleSentence: string;
  contextId: string; difficulty: number; sourceId: string; scope: Scope;
}
export interface MorphologyRelation {
  relationId: string; scope: Scope; wordId: string; baseWordId: string;
  root?: string; prefix?: string; suffix?: string; affixMeaning: string;
  meaningChange: string; spellingChange: string; reviewed: boolean;
}
export interface Question {
  questionId: string; wordId: string; objectiveId: string; contextId: string;
  scope: Scope; purpose: 'battle' | 'retest'; type: QuestionType;
  prompt: string; choices?: string[]; answer: string; audioRef?: string;
  variant: number; fingerprint: string;
}
export interface QuestionInstance {
  instanceId: string; question: Question; presentedAt?: string; settled: boolean; assisted: boolean;
}
export interface BattleRun {
  runId: string; scope: Scope; mode: 'boss'; status: 'active' | 'won' | 'lost'; version: number;
  initialHp: number; currentHp: number; bossInitialHp: 8; bossCurrentHp: number;
  maxQuestionCount: number; questionSet: QuestionInstance[];
  currentQuestionIndex: number; effectiveAnswerCount: number; createdAt: string; endedAt?: string;
}
export interface Answer {
  answerId: string; runId: string; questionInstanceId: string; wordId: string;
  objectiveId: string; questionId: string; questionFingerprint: string; contextId: string;
  questionType: QuestionType; submittedAnswer: string; correctAnswer: string;
  isCorrect: boolean; usedHint: boolean; assisted: boolean; timestamp: string; scope: Scope;
  phase: 'battle' | 'retest'; settlementKey?: string;
}
export interface Evidence {
  evidenceId: string; answerId: string; runId: string; objectiveId: string; wordId: string;
  scope: Scope; dimension: Dimension; isCorrect: boolean; independent: boolean; timestamp: string;
}
export interface SkillCount { correct: number; wrong: number; assisted: number }
export interface LearningState {
  id: string; scope: Scope; objectiveId: string; status: LearningStatus;
  dimensions: Record<Dimension, SkillCount>; updatedAt: string;
}
export interface ReviewSchedule {
  id: string; scope: Scope; objectiveId: string; dimension: Dimension; dueAt: string;
}
export interface Exposure {
  id: string; scope: Scope; runId: string; questionFingerprint: string; questionId: string;
  objectiveId: string; dimension: Dimension; phase: 'battle' | 'retest'; shownAt: string;
}
export interface RemediationTask {
  taskId: string; failureRunId: string; objectiveId: string; wordId: string; dimension: Dimension;
  scope: Scope; phase: 'teaching-required' | 'teaching-open' | 'ready' | 'awaiting-answer' | 'passed' | 'exhausted';
  revision: number; teachingClosedAt?: string; currentQuestion?: Question; passedAt?: string;
}
export interface BattleGate {
  scope: Scope; activeRunId?: string; lockedRunId?: string; nextRunNumber: number;
}
export interface Settings { scope: Scope; playerHp: number }
export interface Reward { rewardId: string; scope: Scope; runId: string; crystalId: string; awardedAt: string }
export interface GameProgress { scope: Scope; crystalIds: string[]; unlockedDemoAreas: string[] }
export interface StoryProgress { id: string; scope: Scope; sceneId: string; unlockedAt: string; viewedAt?: string }
export interface Metadata { id: string; scope: Scope; value: string }

export interface Submission {
  submissionId: string; runId: string; instanceId: string; expectedVersion: number;
  answer: string; usedHint?: boolean; viewedAnswer?: boolean;
}
export type SafeQuestion = Omit<Question, 'answer' | 'fingerprint'>;
export function publicQuestion(question: Question): SafeQuestion {
  const { answer: _answer, fingerprint: _fingerprint, ...safe } = question;
  return safe;
}
