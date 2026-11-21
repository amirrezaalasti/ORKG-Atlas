import { describe, expect, it } from 'vitest';
import { shouldRepair } from './repairPolicy.js';

describe('shouldRepair', () => {
  it('keeps an executable empty result and still repairs execution failures', () => {
    expect(shouldRepair('empty')).toBe(false);
    expect(shouldRepair('ok')).toBe(false);
    expect(shouldRepair('execution_error')).toBe(true);
    expect(shouldRepair('unbound_columns')).toBe(true);
    expect(shouldRepair('no_query')).toBe(true);
    expect(shouldRepair('validator')).toBe(true);
  });
});
