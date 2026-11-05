import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStageArtwork} from '../src/stage-art.mjs';

test('默认主屏无需演出照片或网络图片即可生成', async () => {
  const gradient = {addColorStop(){}};
  const context = new Proxy({
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: text => ({width: String(text).length*20})
  }, {get: (target,key) => key in target ? target[key] : () => {}});
  const previous = globalThis.document;
  globalThis.document = {createElement: () => ({width: 0, height: 0, getContext: () => context})};
  try {
    const artwork = await buildStageArtwork();
    assert.deepEqual([artwork.main.width, artwork.main.height], [2304,720]);
    for (const name of ['brand','kick','apron']) assert.ok(artwork[name].width > 0);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
