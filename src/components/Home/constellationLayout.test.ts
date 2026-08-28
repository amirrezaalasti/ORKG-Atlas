import { describe, expect, it } from 'vitest';
import { ATLAS_STEPS } from './constellationLayout';

describe('ATLAS_STEPS', () => {
  it('explains the atlas as a four-step sequence', () => {
    expect(ATLAS_STEPS.map((step) => step.title)).toEqual([
      'ORKG',
      'Template',
      'Questions',
      'Insight',
    ]);
  });
});
