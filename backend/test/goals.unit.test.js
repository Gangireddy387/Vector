import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function manualProgress(kr) {
  const start = Number(kr.startValue) || 0;
  const target = Number(kr.targetValue);
  const current = Number(kr.currentValue) || 0;
  if (kr.metricType === 'binary') return current >= target ? 100 : 0;
  if (!Number.isFinite(target) || target === start) return current >= target ? 100 : 0;
  return clampProgress(((current - start) / (target - start)) * 100);
}

describe('goal progress math', () => {
  it('computes percent progress', () => {
    assert.equal(manualProgress({ metricType: 'percent', startValue: 0, targetValue: 100, currentValue: 40 }), 40);
  });

  it('computes binary progress', () => {
    assert.equal(manualProgress({ metricType: 'binary', startValue: 0, targetValue: 1, currentValue: 0 }), 0);
    assert.equal(manualProgress({ metricType: 'binary', startValue: 0, targetValue: 1, currentValue: 1 }), 100);
  });

  it('averages key results for a goal', () => {
    const keyResults = [
      { progress: 100 },
      { progress: 50 },
      { progress: 0 },
    ];
    const progress = clampProgress(keyResults.reduce((sum, kr) => sum + kr.progress, 0) / keyResults.length);
    assert.equal(progress, 50);
  });

  it('cascades parent progress from child goals', () => {
    const children = [{ progress: 80 }, { progress: 40 }];
    const progress = clampProgress(children.reduce((sum, child) => sum + child.progress, 0) / children.length);
    assert.equal(progress, 60);
  });
});
