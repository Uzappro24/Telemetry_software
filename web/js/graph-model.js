/* Pure graph geometry and view preferences; also loadable by Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TelemetryGraphs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Units and warning limits mirror telemetry.py; no additional variables are assumed.
  var sensors = {
    battery_voltage: { title: 'Battery voltage', unit: 'V', min: 42, max: 52, digits: 1, warnLow: 44, floor: 0, minSpan: 0.4 },
    motor_current: { title: 'Motor current', unit: 'A', min: 0, max: 40, digits: 1, warnHigh: 30, minSpan: 1 },
    motor_temp: { title: 'Motor temperature', unit: '°C', min: 20, max: 90, digits: 1, warnHigh: 70, minSpan: 1 },
    battery_temp: { title: 'Battery temperature', unit: '°C', min: 15, max: 60, digits: 1, warnHigh: 50, minSpan: 1 },
    wheel_speed: { title: 'Wheel speed', unit: 'RPM', min: 0, max: 1000, digits: 0, warnHigh: 800, floor: 0, minSpan: 10 },
    throttle: { title: 'Throttle', unit: '%', min: 0, max: 100, digits: 0, floor: 0, ceiling: 100, minSpan: 4 }
  };

  function windowPoints(points, start, end) {
    var unique = new Map();
    (points || []).forEach(function (p) {
      if (Number.isFinite(p.time) && Number.isFinite(p.value) && p.time >= start && p.time <= end) {
        unique.set(p.time + ':' + (p.source || ''), p);
      }
    });
    return Array.from(unique.values()).sort(function (a, b) {
      return a.time - b.time || String(a.source || '').localeCompare(String(b.source || ''));
    });
  }
  function extrema(points) {
    if (!points.length) return null;
    return points.reduce(function (result, p) {
      if (p.value < result.min.value) result.min = p;
      if (p.value > result.max.value) result.max = p;
      return result;
    }, { min: points[0], max: points[0] });
  }
  function scale(points, config, previous) {
    var ex = extrema(points);
    if (!ex) return { min: config.min, max: config.max, stable: 0 };
    var span = Math.max(ex.max.value - ex.min.value, config.minSpan);
    var low = ex.min.value - span * 0.12;
    var high = ex.max.value + span * 0.12;
    if (ex.min.value === ex.max.value) {
      low -= span / 2; high += span / 2;
    }
    var step = Math.pow(10, Math.floor(Math.log10((high - low) / 4)));
    var ratio = (high - low) / (4 * step);
    step *= ratio > 5 ? 10 : ratio > 2 ? 5 : ratio > 1 ? 2 : 1;
    low = Math.floor(low / step) * step;
    high = Math.ceil(high / step) * step;
    if (config.floor !== undefined) low = Math.max(config.floor, low);
    if (config.ceiling !== undefined) high = Math.min(config.ceiling, high);
    // Expand immediately; contract only after eight comfortably contained updates.
    if (previous && low >= previous.min && high <= previous.max) {
      var shrink = high - low < (previous.max - previous.min) * 0.65;
      var stable = shrink ? (previous.stable || 0) + 1 : 0;
      if (stable < 8) return { min: previous.min, max: previous.max, stable: stable };
    }
    return { min: low, max: high, stable: 0 };
  }
  function project(point, start, end, domain, plot) {
    return {
      x: plot.left + (point.time - start) / (end - start) * plot.width,
      y: plot.top + (domain.max - point.value) / (domain.max - domain.min) * plot.height,
      point: point
    };
  }
  function nearest(projected, x, y, radius) {
    var best = null, distance = radius * radius;
    projected.forEach(function (p) {
      var d = Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2);
      if (d <= distance) { best = p; distance = d; }
    });
    return best;
  }
  function preferences(raw, keys) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var pinned = Array.isArray(raw.pinned) ? raw.pinned.filter(function (k) { return keys.includes(k); }) : [];
    var selected = Array.isArray(raw.selected) ? raw.selected : keys.slice(0, 3);
    selected = Array.from(new Set(pinned.concat(selected).filter(function (k) { return keys.includes(k); }))).slice(0, 4);
    return { selected: selected, pinned: Array.from(new Set(pinned)).filter(function (k) { return selected.includes(k); }) };
  }
  function toggle(prefs, key, action, keys) {
    var next = preferences(prefs, keys);
    if (!keys.includes(key)) return next;
    if (action === 'pin') {
      if (next.pinned.includes(key)) next.pinned = next.pinned.filter(function (k) { return k !== key; });
      else {
        if (!next.selected.includes(key) && next.selected.length >= 4) return next;
        if (!next.selected.includes(key)) next.selected.push(key);
        next.pinned.push(key);
      }
    } else if (next.selected.includes(key)) {
      if (!next.pinned.includes(key)) next.selected = next.selected.filter(function (k) { return k !== key; });
    } else if (next.selected.length < 4) next.selected.push(key);
    return next;
  }
  return { sensors: sensors, windowPoints: windowPoints, extrema: extrema, scale: scale,
    project: project, nearest: nearest, preferences: preferences, toggle: toggle };
});
