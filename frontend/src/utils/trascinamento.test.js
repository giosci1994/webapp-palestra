import { describe, it, expect } from 'vitest';
import { schedaDopoTrascinamento, posizioneDuranteTrascinamento } from './trascinamento.js';

describe('swipe between tabs', () => {
  it('a long swipe to the left goes to the next tab, to the right to the previous one', () => {
    expect(schedaDopoTrascinamento(0, -150, 0, 400, 3)).toBe(1);
    expect(schedaDopoTrascinamento(2, 150, 0, 400, 3)).toBe(1);
  });

  it('a short, slow swipe stays on the tab', () => {
    expect(schedaDopoTrascinamento(1, -40, -100, 400, 3)).toBe(1);
  });

  it('a quick flick changes tab, but only in the direction of the finger', () => {
    expect(schedaDopoTrascinamento(1, -30, -900, 400, 3)).toBe(2);
    expect(schedaDopoTrascinamento(1, 30, -900, 400, 3)).toBe(1);
  });

  it('never goes past the first or the last tab', () => {
    expect(schedaDopoTrascinamento(0, 300, 0, 400, 3)).toBe(0);
    expect(schedaDopoTrascinamento(1, -300, 0, 400, 2)).toBe(1);
  });

  it('the threshold is a quarter of the panel, at most 120px', () => {
    expect(schedaDopoTrascinamento(0, -110, 0, 1200, 3)).toBe(0);
    expect(schedaDopoTrascinamento(0, -125, 0, 1200, 3)).toBe(1);
    expect(schedaDopoTrascinamento(0, -80, 0, 300, 3)).toBe(1);
  });

  it('the indicator follows the finger between two tabs', () => {
    expect(posizioneDuranteTrascinamento(0, -200, 400, 3)).toBe(0.5);
    expect(posizioneDuranteTrascinamento(0, 200, 400, 3)).toBe(0);
    expect(posizioneDuranteTrascinamento(2, -200, 400, 3)).toBe(2);
  });
});
