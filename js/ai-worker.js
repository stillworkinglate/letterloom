/**
 * Letterloom AI worker — dictionary index + legal-move search off the UI thread.
 */
/* eslint-disable no-undef */
importScripts('engine.js', 'ai.js');

let index = null;

function fail(requestId, error, purpose) {
  self.postMessage({
    type: 'error',
    requestId,
    purpose: purpose || 'think',
    error: error && error.message ? error.message : String(error || 'Worker failed.'),
  });
}

self.onmessage = function onMessage(event) {
  const msg = event.data || {};
  try {
    if (msg.type === 'init') {
      index = LetterloomAI.buildIndex(msg.words || []);
      self.postMessage({ type: 'ready', wordCount: index.words.size });
      return;
    }

    if (msg.type === 'think') {
      if (!index) {
        fail(msg.requestId, new Error('Dictionary index is not ready.'), msg.purpose);
        return;
      }
      const result = LetterloomAI.decideTurn(msg.snapshot, {
        difficulty: msg.difficulty,
        seed: msg.seed,
        index,
        engine: LetterloomEngine,
      });
      self.postMessage({
        type: 'result',
        requestId: msg.requestId,
        purpose: msg.purpose || 'think',
        result,
      });
      return;
    }
  } catch (err) {
    fail(msg.requestId, err, msg.purpose);
  }
};
