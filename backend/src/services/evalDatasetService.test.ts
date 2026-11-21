import { describe, expect, it } from 'vitest';
import { summarizeRuns } from './evalDatasetService.js';

describe('summarizeRuns', () => {
  it('averages F1 and counts exact runs per configuration', () => {
    const scores = summarizeRuns([
      { config: 'full', exact: 1, f1: 1 },
      { config: 'full', exact: 0, f1: 0.5 },
      { config: 'no-schema', exact: 1, f1: 1 },
    ]);
    expect(scores).toEqual([
      { config: 'full', runs: 2, exactRate: 0.5, meanF1: 0.75 },
      { config: 'no-schema', runs: 1, exactRate: 1, meanF1: 1 },
    ]);
  });
});
