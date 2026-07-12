import { describe, expect, it } from 'vitest';
import { compileAxisFormula, evaluateAxisFormula } from './formula';

describe('axis formula parser', () => {
  it('evaluates the documented variables, operators and functions', () => {
    expect(
      evaluateAxisFormula('v1 + (v2 - v1) * t^2 + abs(-2)', {
        t: 0.5,
        v1: 2,
        v2: 10
      })
    ).toBeCloseTo(6, 14);
    expect(
      evaluateAxisFormula('pow(10, t) + log10(100) + ln(exp(1))', {
        t: 2,
        v1: 0,
        v2: 1
      })
    ).toBeCloseTo(103, 14);
  });

  it.each([
    'window.alert(1)',
    'globalThis',
    'Math.log(10)',
    'constructor.constructor(1)',
    '"text"',
    '[1, 2]',
    't = 1',
    'unknown(t)',
    'pow(2)'
  ])('rejects unsafe or unsupported expression: %s', (formula) => {
    expect(() => compileAxisFormula(formula)).toThrow();
  });
});
