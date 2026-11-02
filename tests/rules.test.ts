import { describe, expect, it } from 'vitest';
import { DEMO_OBJECTIVES, demoObjectives, demoQuestions, demoWords, validateDemoContent } from '../src/content/demo';
import { buildQuestionSet, fingerprint, maximumQuestions, normalizeAnswer, validateHp, validateQuestion } from '../src/domain/rules';

const pool = demoQuestions.filter(q => q.purpose === 'battle');

describe('strict HP and content rules', () => {
  it.each([3, 4, 5, 6, 7, 8, 9, 10])('accepts integer HP %s without coercion', hp => {
    expect(validateHp(hp)).toBe(hp);
    expect(maximumQuestions(hp)).toBe(8 + hp - 1);
  });
  it.each([2, 11, 4.5, 0, -1, '', '5', null, undefined, NaN, Infinity, -Infinity, {}, true])('rejects invalid HP %s', hp => {
    expect(() => validateHp(hp)).toThrow('INVALID_HP');
  });
  it('has 24 original battle questions and 18 distinct retests', () => {
    expect(() => validateDemoContent()).not.toThrow();
    expect(pool).toHaveLength(24);
    expect(demoQuestions.filter(q => q.purpose === 'retest')).toHaveLength(18);
    expect(new Set(demoQuestions.map(q => q.fingerprint)).size).toBe(42);
    expect(demoWords.every(w => w.scope === 'demo' && w.sourceIds[0] === 'demo:original')).toBe(true);
  });
  it('does not disguise IDs, punctuation or option order as new content', () => {
    const question = pool[0];
    const altered = { ...question, questionId: 'another-id', contextId: 'another-context-id', prompt: question.prompt.toUpperCase().replace('?', '!!!'), choices: [...question.choices!].reverse() };
    expect(fingerprint(altered)).toBe(fingerprint(question));
  });
  it.each([3, 5, 7, 10])('preserves all eight required slots and preallocates reserves at HP %s', hp => {
    const set = buildQuestionSet(pool, DEMO_OBJECTIVES, hp, 0);
    expect(set).toHaveLength(8 + hp - 1);
    expect(set.slice(0, 8).map(q => [q.objectiveId, q.type])).toEqual(DEMO_OBJECTIVES.flatMap(objectiveId => ['meaning-match', 'context-challenge', 'listen-spell', 'meaning-spell'].map(type => [objectiveId, type])));
    expect(new Set(set.map(q => q.fingerprint)).size).toBe(set.length);
  });
  it('rotates real content on the next run while preserving required order', () => {
    const first = buildQuestionSet(pool, DEMO_OBJECTIVES, 5, 0);
    const retry = buildQuestionSet(pool, DEMO_OBJECTIVES, 5, 1);
    expect(retry.slice(0, 8).every((q, i) => q.fingerprint !== first[i].fingerprint)).toBe(true);
  });
  it('refuses insufficient, duplicate and incomplete required questions', () => {
    expect(() => buildQuestionSet(pool.slice(0, 9), DEMO_OBJECTIVES, 3, 0)).toThrow();
    expect(() => buildQuestionSet([...pool.slice(0, -1), pool[0]], DEMO_OBJECTIVES, 5, 0)).toThrow();
    expect(() => buildQuestionSet(pool.filter(q => q.objectiveId !== DEMO_OBJECTIVES[1] || q.type !== 'meaning-spell'), DEMO_OBJECTIVES, 5, 0)).toThrow('MISSING_REQUIRED_QUESTION');
  });
  it('rejects wrong objective bindings, exposed spelling answers and missing audio references', () => {
    expect(() => validateQuestion({ ...pool[0], wordId: 'demo:happy' }, demoWords, demoObjectives)).toThrow('INVALID_OBJECTIVE_BINDING');
    const spelling = { ...pool.find(q => q.type === 'meaning-spell')!, prompt: 'Type crystal.' };
    spelling.fingerprint = fingerprint(spelling);
    expect(() => validateQuestion(spelling, demoWords, demoObjectives)).toThrow('SPELLING_ANSWER_EXPOSED');
    expect(() => validateQuestion({ ...pool.find(q => q.type === 'listen-spell')!, audioRef: undefined }, demoWords, demoObjectives)).toThrow('MISSING_AUDIO_REFERENCE');
  });
  it('normalizes boundary whitespace and case, never internal letter order', () => {
    expect(normalizeAnswer('  Crystal  ')).toBe('crystal');
    expect(normalizeAnswer('crsytal')).not.toBe('crystal');
    expect(normalizeAnswer('crys tal')).not.toBe('crystal');
  });
});
