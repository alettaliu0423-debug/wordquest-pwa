import type { Objective, Question, QuestionType, Word } from '../domain/model';
import { fingerprint, requireRule, validateQuestion } from '../domain/rules';
import type { WordQuestDB } from '../db/database';

const createdAt = '2026-11-02T00:00:00.000Z';
export const DEMO_OBJECTIVES = ['demo:crystal:solid', 'demo:happy:feeling'];
export const demoWords: Word[] = [
  { wordId: 'demo:crystal', headword: 'crystal', normalizedWord: 'crystal', partOfSpeech: 'noun', audioRef: 'demo-audio:crystal', sourceIds: ['demo:original'], scope: 'demo', createdAt, updatedAt: createdAt },
  { wordId: 'demo:happy', headword: 'happy', normalizedWord: 'happy', partOfSpeech: 'adjective', audioRef: 'demo-audio:happy', sourceIds: ['demo:original'], scope: 'demo', createdAt, updatedAt: createdAt },
];
export const demoObjectives: Objective[] = [
  { objectiveId: DEMO_OBJECTIVES[0], wordId: 'demo:crystal', definition: 'A solid mineral with a regular shape and flat faces.', exampleSentence: 'A clear crystal glittered inside the rock.', contextId: 'demo:teaching:crystal', difficulty: 1, sourceId: 'demo:original', scope: 'demo' },
  { objectiveId: DEMO_OBJECTIVES[1], wordId: 'demo:happy', definition: 'Feeling pleased or glad.', exampleSentence: 'The explorers felt happy when their friend returned safely.', contextId: 'demo:teaching:happy', difficulty: 1, sourceId: 'demo:original', scope: 'demo' },
];

const battlePrompts: Record<string, Record<string, string[]>> = {
  crystal: {
    'meaning-match': [
      'Which word names a mineral solid with flat faces and a regular shape?',
      'Choose the name for a naturally formed mineral whose faces meet at regular angles.',
      'Which word describes a solid mineral that can grow into a neat geometric shape?',
    ],
    'context-challenge': [
      'Inside the cave, a clear ___ with six flat faces caught the light. Choose the missing word.',
      'The geologist held up a quartz ___ and pointed to its regular edges. Choose the missing word.',
      'Deep in the rock, a purple ___ had grown with smooth, flat sides. Choose the missing word.',
    ],
    'listen-spell': [
      'Listen, then type the word for the clear mineral treasure inside the cave.',
      'Hear the guide name a solid mineral with flat faces. Type the whole word.',
      'Listen to the name of the geometric mineral found in the rock. Spell it in full.',
    ],
    'meaning-spell': [
      'Type the word: a mineral solid with a regular shape and flat faces.',
      'A piece of quartz has grown with six flat faces. Type the noun for this kind of solid.',
      'An explorer finds a mineral with a neat geometric shape. Type its seven-letter name.',
    ],
  },
  happy: {
    'meaning-match': [
      'Which word means feeling pleased or glad?',
      'Choose the word for the joyful feeling that makes you want to smile.',
      'Which word describes someone who feels cheerful and content?',
    ],
    'context-challenge': [
      'Mina smiled when her lost puppy returned. She felt ___. Choose the missing word.',
      'After hearing that everyone was safe, Leo laughed with relief and felt ___. Choose the missing word.',
      'The friends were ___ to see one another after a long trip. Choose the missing word.',
    ],
    'listen-spell': [
      'Listen, then type the word for the glad feeling after good news.',
      'Hear the word that describes a cheerful person. Type it in full.',
      'Listen to the feeling word for someone pleased to meet a friend. Spell it.',
    ],
    'meaning-spell': [
      'Type the word that means feeling pleased or glad.',
      'A child smiles with joy after finding a missing toy. Type the five-letter feeling word.',
      'Your team succeeds and you feel cheerful. Type the adjective for that feeling.',
    ],
  },
};
const retestPrompts: Record<string, Record<string, string[]>> = {
  crystal: {
    'meaning-match': [
      'A museum label describes a mineral with naturally formed flat faces. Which noun fits?',
      'A scientist studies a solid whose regular outer shape reflects an ordered structure. What is it called?',
      'An amethyst sample has a pointed end and regular mineral faces. Which word names the sample?',
    ],
    'context-challenge': [
      'At the museum, a diamond ___ rested beside a rough lump of coal. Choose the missing word.',
      'Under a magnifying glass, the tiny mineral ___ showed sharply defined flat faces. Choose the missing word.',
      'The miner discovered a hollow rock lined with a shining ___ of quartz. Choose the missing word.',
    ],
    'meaning-spell': [
      'In a display case sits a single piece of amethyst with regular flat faces. Type the noun for it.',
      'A mineral grows slowly inside a hollow stone and forms a pointed geometric solid. Spell its name.',
      'A scientist compares the flat faces of two naturally shaped quartz solids. Type the singular noun for one.',
    ],
  },
  happy: {
    'meaning-match': [
      'A person receives wonderful news and feels delighted. Which adjective fits?',
      'Choose the adjective for a person who is enjoying a pleasant moment and feels glad.',
      'Which word describes the cheerful feeling of being with people you love?',
    ],
    'context-challenge': [
      'The gardener felt ___ when the first flower finally opened. Choose the missing word.',
      'Sam was ___ because his grandparents had arrived for his birthday. Choose the missing word.',
      'Finishing her first kite made Noor feel ___ and proud. Choose the missing word.',
    ],
    'meaning-spell': [
      'You receive a letter from a friend and feel glad. Type the five-letter adjective.',
      'A musician smiles after playing a favourite song beautifully. Spell the word for feeling pleased.',
      'A family enjoys a picnic together and everyone feels cheerful. Type the adjective for that feeling.',
    ],
  },
};

function makeQuestions(prompts: typeof battlePrompts, purpose: Question['purpose']): Question[] {
  return demoWords.flatMap(word => Object.entries(prompts[word.headword]).flatMap(([type, entries]) => entries.map((prompt, variant) => {
    const question: Question = {
      questionId: `demo:${purpose}:${word.headword}:${type}:${variant}`,
      wordId: word.wordId, objectiveId: demoObjectives.find(o => o.wordId === word.wordId)!.objectiveId,
      contextId: `demo:${purpose}:${word.headword}:${type}:${variant}:context`,
      scope: 'demo', purpose, type: type as QuestionType, prompt, answer: word.headword,
      choices: type === 'meaning-match' || type === 'context-challenge'
        ? word.headword === 'crystal' ? ['crystal', 'ribbon', 'feather', 'twig'] : ['happy', 'gloomy', 'narrow', 'silent']
        : undefined,
      audioRef: type === 'listen-spell' ? word.audioRef : undefined,
      variant, fingerprint: '',
    };
    question.fingerprint = fingerprint(question);
    return question;
  })));
}
export const demoQuestions = [...makeQuestions(battlePrompts, 'battle'), ...makeQuestions(retestPrompts, 'retest')];

export function validateDemoContent(): void {
  for (const q of demoQuestions) validateQuestion(q, demoWords, demoObjectives);
  requireRule(new Set(demoQuestions.map(q => q.fingerprint)).size === demoQuestions.length, 'DUPLICATE_CONTENT');
  requireRule(demoQuestions.filter(q => q.purpose === 'battle').length >= 24, 'INSUFFICIENT_DEMO_BATTLE_CONTENT');
  for (const objectiveId of DEMO_OBJECTIVES) {
    for (const type of ['meaning-match', 'context-challenge', 'meaning-spell']) {
      requireRule(demoQuestions.filter(q => q.purpose === 'retest' && q.objectiveId === objectiveId && q.type === type).length >= 3, 'INSUFFICIENT_RETEST_CONTENT');
    }
  }
}

export async function seedDemo(db: WordQuestDB): Promise<void> {
  validateDemoContent();
  await db.transaction('rw', db.tables, async () => {
    if (await db.metadata.get('demo:content:1')) return;
    await db.sources.add({ sourceId: 'demo:original', scope: 'demo', title: 'Original WordQuest Demo', kind: 'original-demo' });
    await db.words.bulkAdd(demoWords);
    await db.objectives.bulkAdd(demoObjectives);
    await db.questions.bulkAdd(demoQuestions);
    await db.settings.add({ scope: 'demo', playerHp: 5 });
    await db.gates.add({ scope: 'demo', nextRunNumber: 0 });
    await db.gameProgress.add({ scope: 'demo', crystalIds: [], unlockedDemoAreas: ['forest'] });
    await db.metadata.add({ id: 'demo:content:1', scope: 'demo', value: 'original-demo-v1' });
  });
}
