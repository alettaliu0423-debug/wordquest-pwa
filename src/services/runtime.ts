import { db } from '../db/runtime';
import { preparePronunciations } from '../audio/pronunciation';
import { GameService } from './game';

export const game = new GameService(db, { beforeStart: preparePronunciations });
