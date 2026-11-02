import { RuleError } from '../domain/rules';

export function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) return 'We could not save that step. Please try again.';
  if (!(error instanceof RuleError)) return error.message;
  const messages: Record<string, string> = {
    REVIEW_LOCKED: 'Finish every required review before trying the guardian again.',
    ACTIVE_RUN_EXISTS: 'You already have a saved battle. Choose Resume Battle.',
    RUN_NOT_ACTIVE: 'This battle has ended. Your result has been saved.',
    STALE_REVIEW: 'This review changed in another window. Open the latest saved task.',
    REVIEW_SESSION_BUSY: 'Finish the open learning card or independent check before opening another task.',
    ASSISTED_REPLACEMENT_EXHAUSTED: 'This question used assistance. There are no unused replacement questions. Your battle is paused with saved health. Ask a grown-up to add new questions.',
    NO_REVIEW_LOCK: 'This review is already complete. You can return to the adventure.',
    TEACHING_MUST_BE_CLOSED: 'Close the learning card before starting the independent check.',
    INSUFFICIENT_UNIQUE_QUESTIONS: 'There are not enough different questions to begin. Ask a grown-up for help.',
  };
  return messages[error.code] || 'This step is not available. Your saved progress has not been reset.';
}
