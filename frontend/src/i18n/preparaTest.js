// The tests check and use every language: all of them are loaded before
// they start (vitest.config.js, setupFiles)
import { caricaTutteLeLingue } from './index.js';

await caricaTutteLeLingue();
