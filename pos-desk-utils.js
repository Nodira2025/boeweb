(function initPosDeskUtils(globalScope) {
  'use strict';

  const MAX_SCAN_QUANTITY = 999;

  function parsePosScanCommand(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return { quantity: 1, code: '' };

    const multiplierMatch = raw.match(/^(\d{1,3})\s*[xX*]\s*(\S(?:.*\S)?)$/);
    if (!multiplierMatch) return { quantity: 1, code: raw };

    const quantity = Number(multiplierMatch[1]);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SCAN_QUANTITY) {
      return { quantity: 1, code: raw };
    }
    return { quantity, code: multiplierMatch[2].trim() };
  }

  function calculateCashChange(totalValue, tenderedValue) {
    const totalCents = Math.round(Number(totalValue) * 100);
    const tenderedCents = Math.round(Number(tenderedValue) * 100);
    if (!Number.isSafeInteger(totalCents) || totalCents < 0
        || !Number.isSafeInteger(tenderedCents) || tenderedCents < 0) {
      return null;
    }
    return {
      total: totalCents / 100,
      tendered: tenderedCents / 100,
      change: (tenderedCents - totalCents) / 100,
      sufficient: tenderedCents >= totalCents
    };
  }

  const api = Object.freeze({ calculateCashChange, parsePosScanCommand });
  globalScope.PosDeskUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
