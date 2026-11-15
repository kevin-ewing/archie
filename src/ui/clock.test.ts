import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockText, createWatch } from './clock.ts';

test('12-hour clock text with AM / PM', () => {
  assert.deepEqual(clockText(0.25), { clock: '12:15', ampm: 'AM' });
  assert.deepEqual(clockText(9.05), { clock: '9:03', ampm: 'AM' });
  assert.deepEqual(clockText(12), { clock: '12:00', ampm: 'PM' });
  assert.deepEqual(clockText(19.5), { clock: '7:30', ampm: 'PM' });
  assert.deepEqual(clockText(23.999), { clock: '11:59', ampm: 'PM' });
});


test('the larger watch draws its hands over the raised AM/PM aperture', () => {
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const savedImageData = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
  let drawn: Uint8ClampedArray | undefined;
  Object.assign(globalThis, {
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData: (image: { data: Uint8ClampedArray }) => { drawn = image.data.slice(); } }) }) },
    ImageData: class { data: Uint8ClampedArray; constructor(data: Uint8ClampedArray) { this.data = data; } },
  });
  try {
    const watch = createWatch(22);
    watch.draw(6, 0);
    assert.equal(watch.canvas.width, 45);
    const pixel = ((22 + 9 + 4) * 45 + 22) * 4;
    assert.deepEqual([...drawn!.slice(pixel, pixel + 4)], [156, 152, 130, 255], 'six o’clock hour hand covers the aperture background');
  } finally {
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (savedImageData) Object.defineProperty(globalThis, 'ImageData', savedImageData); else Reflect.deleteProperty(globalThis, 'ImageData');
  }
});
