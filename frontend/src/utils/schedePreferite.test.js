import { describe, it, expect } from 'vitest';
import { primaLePreferite } from './schedePreferite.js';

const schede = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

describe('primaLePreferite', () => {
  it('the favorites first, then the others, each in the order they had', () => {
    expect(primaLePreferite(schede, new Set([4, 2])).map(s => s.id)).toEqual([2, 4, 1, 3]);
  });

  it('without favorites, or with ids of plans not in the list, nothing moves', () => {
    expect(primaLePreferite(schede, new Set()).map(s => s.id)).toEqual([1, 2, 3, 4]);
    expect(primaLePreferite(schede, new Set([9])).map(s => s.id)).toEqual([1, 2, 3, 4]);
    expect(primaLePreferite([], new Set([1]))).toEqual([]);
  });
});
