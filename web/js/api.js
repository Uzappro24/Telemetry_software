/* HTTP client for telemetry retrieval and session controls. */
(function () {
  'use strict';
  var base = '';

  function setBase(url) {
    base = (url || '').trim().replace(/\/+$/, '');
  }

  async function request(path, options) {
    options = options || {};
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, options.timeoutMs || 4000);
    try {
      var response = await fetch(base + path, {
        method: options.method || 'GET',
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: 'no-store',
        signal: controller.signal
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var message = payload.error && payload.error.message;
        throw new Error(message || 'Telemetry API returned ' + response.status);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.TelemetryAPI = {
    setBase: setBase,
    getTelemetry: function (seconds) {
      return request('/api/telemetry?seconds=' + encodeURIComponent(seconds || 60));
    },
    getStatus: function () { return request('/api/status'); },
    getEvents: function (limit) {
      return request('/api/events?limit=' + encodeURIComponent(limit || 100));
    },
    clearEvents: function () { return request('/api/events', { method: 'DELETE' }); },
    clearSession: function () { return request('/api/session', { method: 'DELETE' }); }
  };
})();
