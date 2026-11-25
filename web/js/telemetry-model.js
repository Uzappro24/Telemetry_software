(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TelemetryModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mergeHistory(history, samples, sensorNames, cutoffMs) {
    sensorNames.forEach(function (name) {
      var byTimestamp = {};
      (history[name] || []).forEach(function (point) {
        if (point.time >= cutoffMs) byTimestamp[point.time + ':' + (point.source || 'unknown')] = point;
      });
      (samples || []).forEach(function (sample) {
        if (Number.isFinite(sample.timestamp_ms) && sample.timestamp_ms >= cutoffMs && Number.isFinite(sample[name])) {
          byTimestamp[sample.timestamp_ms + ':' + (sample.source || 'unknown')] = {
            time: sample.timestamp_ms,
            value: sample[name],
            source: sample.source || 'unknown'
          };
        }
      });
      history[name] = Object.keys(byTimestamp).map(function (key) {
        return byTimestamp[key];
      }).sort(function (a, b) { return a.time - b.time || String(a.source).localeCompare(String(b.source)); }).slice(-10000);
    });
    return history;
  }

  function connectionState(requestSucceeded, status) {
    if (!requestSucceeded) return 'disconnected';
    if (!status || ['active', 'stale', 'disconnected'].indexOf(status.state) === -1) {
      return 'disconnected';
    }
    return status.state;
  }

  function PollGate() {
    this.inFlight = false;
    this.failures = 0;
  }

  PollGate.prototype.begin = function () {
    if (this.inFlight) return false;
    this.inFlight = true;
    return true;
  };

  PollGate.prototype.finish = function (succeeded) {
    this.inFlight = false;
    this.failures = succeeded ? 0 : this.failures + 1;
  };

  PollGate.prototype.delay = function (baseMs) {
    return Math.min(10000, baseMs * Math.pow(2, Math.min(this.failures, 4)));
  };

  return {
    mergeHistory: mergeHistory,
    connectionState: connectionState,
    PollGate: PollGate
  };
});
