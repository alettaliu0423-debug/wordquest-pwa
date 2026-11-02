import { expect, it } from 'vitest';
import { orderedChoices } from '../src/ui/choiceOrder';

it('preserves all answer options without changing the content or source order', () => {
  const source = ['crystal', 'ribbon', 'feather', 'twig'];
  expect(orderedChoices(source, 'run:a:question:1').sort()).toEqual([...source].sort());
  expect(source).toEqual(['crystal', 'ribbon', 'feather', 'twig']);
});
it('keeps order stable on refresh but does not fix every correct option in first position', () => {
  const choices = ['crystal', 'ribbon', 'feather', 'twig'];
  const seeds = ['run:a:1', 'run:b:1', 'run:c:1', 'run:d:1', 'run:e:1'];
  const positions = seeds.map(seed => orderedChoices(choices, seed).indexOf('crystal'));
  expect(new Set(positions).size).toBeGreaterThan(1);
  expect(orderedChoices(choices, seeds[0])).toEqual(orderedChoices(choices, seeds[0]));
});
