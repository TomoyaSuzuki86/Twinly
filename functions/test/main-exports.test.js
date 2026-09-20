const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('main exposes daily summary handlers from the push implementation explicitly', () => {
  const originalLoad = Module._load;
  const mainPath = require.resolve('../main');
  try {
    Module._load = function(request, parent, isMain) {
      if (parent?.filename === mainPath && request === './index') {
        return { twinlyAi: Symbol('twinlyAi'), getDailySummaryEmailSettings: Symbol('legacy') };
      }
      if (parent?.filename === mainPath && request === './daily-summary-push') {
        return {
          getDailySummaryEmailSettings: Symbol.for('daily-get'),
          setDailySummaryEmailSettings: Symbol.for('daily-set'),
          sendDailySummaryEmails: Symbol.for('daily-send'),
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[mainPath];
    const actual = require('../main');
    assert.equal(actual.getDailySummaryEmailSettings, Symbol.for('daily-get'));
    assert.equal(actual.setDailySummaryEmailSettings, Symbol.for('daily-set'));
    assert.equal(actual.sendDailySummaryEmails, Symbol.for('daily-send'));
    assert.ok(actual.twinlyAi);
  } finally {
    Module._load = originalLoad;
    delete require.cache[mainPath];
  }
});
