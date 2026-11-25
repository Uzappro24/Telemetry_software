/* Canvas base plot + lightweight inspection overlay. No chart dependency. */
(function () {
  'use strict';
  var M = window.TelemetryGraphs;
  function GraphView(box, config) {
    this.box = box; this.config = config; this.projected = []; this.pointer = null;
    this.frame = 0; this.domain = null; this.seconds = null;
    box.textContent = '';
    var heading = document.createElement('div'); heading.className = 'graph-heading';
    this.title = document.createElement('h3'); this.title.textContent = config.title;
    this.summary = document.createElement('span'); this.summary.className = 'graph-summary';
    heading.append(this.title, this.summary); box.appendChild(heading);
    this.surface = document.createElement('div'); this.surface.className = 'graph-surface';
    this.base = document.createElement('canvas'); this.overlay = document.createElement('canvas');
    this.overlay.tabIndex = 0;
    this.overlay.setAttribute('aria-label', config.title + ' graph. Use left and right arrows to inspect readings.');
    this.base.setAttribute('aria-hidden', 'true');
    this.surface.append(this.base, this.overlay); box.appendChild(this.surface);
    this.tooltip = document.createElement('div'); this.tooltip.className = 'graph-tooltip';
    this.tooltip.hidden = true; this.tooltip.setAttribute('role', 'tooltip');
    this.surface.appendChild(this.tooltip);
    this.legend = document.createElement('div'); this.legend.className = 'graph-legend';
    box.appendChild(this.legend);
    var self = this;
    this.overlay.addEventListener('pointermove', function (e) {
      var rect = self.surface.getBoundingClientRect();
      self.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top, touch: e.pointerType !== 'mouse' };
      self.scheduleInspect();
    });
    this.overlay.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') self.overlay.setPointerCapture(e.pointerId);
      var rect = self.surface.getBoundingClientRect();
      self.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top, touch: e.pointerType !== 'mouse' };
      self.scheduleInspect();
    });
    this.overlay.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse') { self.pointer = null; self.selected = null; self.inspect(); }
    });
    this.overlay.addEventListener('pointercancel', function () { self.pointer = null; self.selected = null; self.inspect(); });
    this.overlay.addEventListener('blur', function () { self.selected = null; self.pointer = null; self.inspect(); });
    this.overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { self.selected = null; self.pointer = null; self.inspect(); return; }
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || !self.projected.length) return;
      e.preventDefault(); self.pointer = null;
      var index = self.projected.findIndex(function (p) { return self.selected && p.point === self.selected.point; });
      index = Math.max(0, Math.min(self.projected.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)));
      self.selected = self.projected[index]; self.inspect();
    });
  }
  GraphView.prototype.scheduleInspect = function () {
    if (this.frame) return;
    var self = this;
    this.frame = requestAnimationFrame(function () { self.frame = 0; self.inspect(); });
  };
  GraphView.prototype.format = function (value) { return value.toFixed(this.config.digits) + ' ' + this.config.unit; };
  GraphView.prototype.render = function (points, seconds, now) {
    var rect = this.surface.getBoundingClientRect();
    var w = Math.round(rect.width), h = Math.round(rect.height);
    if (!w || !h || this.box.hidden) return;
    var ratio = window.devicePixelRatio || 1;
    [this.base, this.overlay].forEach(function (canvas) {
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
        canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
      }
    });
    this.width = w; this.height = h; this.ratio = ratio;
    var ctx = this.base.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h);
    var css = getComputedStyle(this.box);
    var color = function (name) { return css.getPropertyValue(name).trim(); };
    this.colors = { text: color('--text'), muted: color('--plot-text'), accent: color('--accent'), min: color('--plot-min'), warn: color('--warn'), grid: color('--line') };
    var start = now - seconds * 1000;
    var visible = M.windowPoints(points, start, now);
    if (seconds !== this.seconds) this.domain = null;
    this.domain = M.scale(visible, this.config, this.domain); this.seconds = seconds;
    var domain = this.domain;
    var plot = { left: 70, top: 24, width: Math.max(1, w - 90), height: h - 79 };
    this.plot = plot;
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.lineWidth = 1;
    ctx.fillStyle = this.colors.text; ctx.fillText(this.config.title + ' (' + this.config.unit + ')', plot.left, 13);
    for (var i = 0; i <= 4; i++) {
      var y = plot.top + i * plot.height / 4;
      ctx.strokeStyle = this.colors.grid; ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(w - 20, y); ctx.stroke();
      var value = domain.max - i * (domain.max - domain.min) / 4;
      ctx.fillStyle = this.colors.muted; ctx.textAlign = 'right';
      var precision = Math.max(this.config.digits, Math.min(3, Math.ceil(-Math.log10((domain.max - domain.min) / 4))));
      ctx.fillText(value.toFixed(Math.max(0, precision)), plot.left - 8, y + 4);
    }
    var ticks = w < 400 ? 2 : 4;
    for (var t = 0; t <= ticks; t++) {
      var x = plot.left + t * plot.width / ticks;
      ctx.strokeStyle = this.colors.grid; ctx.beginPath(); ctx.moveTo(x, plot.top); ctx.lineTo(x, plot.top + plot.height); ctx.stroke();
      ctx.textAlign = t === 0 ? 'left' : t === ticks ? 'right' : 'center';
      ctx.fillStyle = this.colors.muted;
      ctx.fillText(new Date(start + t * seconds * 1000 / ticks).toLocaleTimeString('en-GB', { hour12: false }), x, h - 35);
    }
    ctx.textAlign = 'center'; ctx.fillText('Source time (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')', plot.left + plot.width / 2, h - 12);
    var self = this;
    var thresholds = [];
    ['warnLow', 'warnHigh'].forEach(function (key) {
      var threshold = self.config[key];
      if (typeof threshold !== 'number') return;
      thresholds.push((key === 'warnLow' ? 'Low' : 'High') + ' warning ' + self.format(threshold));
      if (threshold < domain.min || threshold > domain.max) return;
      var ty = M.project({ time: start, value: threshold }, start, now, domain, plot).y;
      ctx.setLineDash([5, 4]); ctx.strokeStyle = self.colors.warn; ctx.beginPath();
      ctx.moveTo(plot.left, ty); ctx.lineTo(w - 20, ty); ctx.stroke(); ctx.setLineDash([]);
    });
    var oldSelection = this.selected && this.selected.point;
    this.projected = visible.map(function (p) { return M.project(p, start, now, domain, plot); });
    // Separate sources and break lines across long gaps; retain actual sample spacing.
    var series = new Map();
    this.projected.forEach(function (p) {
      var source = p.point.source || '';
      if (!series.has(source)) series.set(source, []);
      series.get(source).push(p);
    });
    ctx.save(); ctx.beginPath(); ctx.rect(plot.left, plot.top, plot.width, plot.height); ctx.clip();
    ctx.strokeStyle = this.colors.accent; ctx.lineWidth = 1.7; ctx.lineJoin = 'round';
    series.forEach(function (points) {
      var gaps = points.slice(1).map(function (p, i) { return p.point.time - points[i].point.time; }).filter(function (gap) { return gap > 0; }).sort(function (a, b) { return a - b; });
      var gapLimit = Math.max(3000, (gaps[Math.floor(gaps.length / 2)] || 500) * 4);
      ctx.beginPath(); points.forEach(function (p, i) {
        if (!i || p.point.time - points[i - 1].point.time > gapLimit) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }); ctx.stroke();
    }); ctx.restore();
    var ex = M.extrema(visible);
    this.legend.textContent = '';
    if (ex) {
      [{ label: 'MIN', point: ex.min, color: this.colors.min }, { label: 'MAX', point: ex.max, color: this.colors.warn }].forEach(function (entry, i) {
        var p = M.project(entry.point, start, now, domain, plot);
        ctx.strokeStyle = entry.color; ctx.fillStyle = color('--bg'); ctx.lineWidth = 2;
        ctx.beginPath();
        if (i === 0) ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        else ctx.rect(p.x - 3, p.y - 3, 6, 6);
        ctx.fill(); ctx.stroke();
        var label = document.createElement('span'); label.className = i ? 'extreme-max' : 'extreme-min';
        label.textContent = (i ? '■ ' : '○ ') + entry.label + ' ' + self.format(entry.point.value);
        self.legend.appendChild(label);
      });
      this.summary.textContent = this.format(visible[visible.length - 1].value);
    } else {
      ctx.fillStyle = this.colors.muted; ctx.textAlign = 'center';
      ctx.fillText('No readings in this time window', plot.left + plot.width / 2, plot.top + plot.height / 2);
      this.summary.textContent = 'Unavailable';
    }
    if (thresholds.length) {
      var note = document.createElement('span'); note.textContent = thresholds.join(' · '); this.legend.appendChild(note);
    }
    this.overlay.setAttribute('aria-label', this.config.title + ': ' + (ex ? 'minimum ' + this.format(ex.min.value) + ', maximum ' + this.format(ex.max.value) : 'no data') + '. Arrow keys inspect readings.');
    this.selected = oldSelection ? this.projected.find(function (p) {
      return p.point.time === oldSelection.time && p.point.source === oldSelection.source;
    }) : null;
    this.inspect();
  };
  GraphView.prototype.inspect = function () {
    if (!this.width) return;
    var ctx = this.overlay.getContext('2d'); ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    if (this.pointer) this.selected = M.nearest(this.projected, this.pointer.x, this.pointer.y, this.pointer.touch ? 80 : 32);
    var selected = this.selected;
    this.tooltip.hidden = !selected;
    if (!selected) return;
    ctx.strokeStyle = this.colors.text; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(selected.x, this.plot.top); ctx.lineTo(selected.x, this.plot.top + this.plot.height); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = this.colors.text; ctx.beginPath(); ctx.arc(selected.x, selected.y, 4, 0, Math.PI * 2); ctx.fill();
    this.tooltip.textContent = this.format(selected.point.value) + '\n' + new Date(selected.point.time).toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false
    }) + '\n' + (selected.point.source || 'Unknown source');
    this.tooltip.style.left = Math.max(4, Math.min(this.width - this.tooltip.offsetWidth - 4, selected.x + 12)) + 'px';
    this.tooltip.style.top = Math.max(4, Math.min(this.height - this.tooltip.offsetHeight - 4, selected.y - this.tooltip.offsetHeight - 12)) + 'px';
  };
  window.TelemetryGraphView = GraphView;
})();
