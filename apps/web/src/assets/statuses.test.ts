import { describe, expect, it } from 'vitest';
import { defaultStatus, statusesFor } from './statuses';
import { canEditAssets } from '../auth/canEdit';

describe('statuses and permissions', () => {
  it('lists the lifecycle for each class', () => {
    expect(statusesFor('living')).toContain('established');
    expect(statusesFor('living')).not.toContain('active');
    expect(statusesFor('built')).toContain('out_of_service');
    expect(statusesFor('built')).not.toContain('planted');
    expect([defaultStatus('living'), defaultStatus('built')]).toEqual(['planted', 'active']);
  });
  it('owner is read-only; every other role edits assets', () => {
    expect(canEditAssets(['owner'])).toBe(false);
    for (const r of [
      'manager',
      'field_manager',
      'curator',
      'green_team',
      'field_engineer',
    ] as const)
      expect(canEditAssets([r])).toBe(true);
    expect(canEditAssets(['owner', 'curator'])).toBe(true);
  });
});
