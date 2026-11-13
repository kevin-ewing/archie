import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockText } from './clock.ts';

test('12-hour clock text with AM / PM', () => {
  assert.deepEqual(clockText(0.25), { clock: '12:15', ampm: 'AM' });
  assert.deepEqual(clockText(9.05), { clock: '9:03', ampm: 'AM' });
  assert.deepEqual(clockText(12), { clock: '12:00', ampm: 'PM' });
  assert.deepEqual(clockText(19.5), { clock: '7:30', ampm: 'PM' });
  assert.deepEqual(clockText(23.999), { clock: '11:59', ampm: 'PM' });
});
