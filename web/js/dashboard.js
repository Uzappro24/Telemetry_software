/* Live dashboard controller: history loading, single-flight polling and UI state. */
(function () {
  'use strict';

  var pollMs = 500;
  var pollTimer = null;
  var latestSourceTimestamp = null;
  var serverClockOffset = 0;
  var history = {};
  var pollGate = new window.TelemetryModel.PollGate();
  var configs = window.TelemetryGraphs.sensors;
  var graphViews = {};
  var sessionId = null;
  var sensorNames = Object.keys(configs);
  sensorNames.forEach(function (key) { history[key] = []; });

  var rangeSelect = document.getElementById('time-range');
  var pollingSelect = document.getElementById('polling-rate');
  var backendInput = document.getElementById('backend-ip');
  var rateLabel = document.getElementById('update-rate');
  var lastUpdate = document.getElementById('last-update');
  var clock = document.getElementById('clock');
  var badge = document.getElementById('telemetry-badge');
  var banner = document.querySelector('.conn-banner');

  function configuredSeconds() {
    return Number(rangeSelect.value) || 60;
  }

  function setBackend() {
    var value = backendInput.value.trim();
    if (!value) {
      window.TelemetryAPI.setBase('');
      return true;
    }
    var candidate = /^https?:\/\//i.test(value) ? value : 'http://' + value;
    try {
      var parsed = new URL(candidate);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('unsupported protocol');
      window.TelemetryAPI.setBase(parsed.origin);
      return true;
    } catch (_error) {
      renderLocalEvent('fault', 'Backend URL is invalid');
      return false;
    }
  }

  function updateCards(data) {
    var warningActive = false;
    sensorNames.forEach(function (key) {
      var config = configs[key];
      var value = data[key];
      var card = document.querySelector('[data-sensor="' + key + '"]');
      if (!card) return;
      var tag = card.querySelector('.stale-tag');
      if (!Number.isFinite(value)) {
        card.querySelector('.num').textContent = '—';
        card.querySelectorAll('.range span').forEach(function (span, i) { span.textContent = (i ? 'MAX ' : 'MIN ') + '—'; });
        card.classList.remove('is-fault'); card.classList.add('sensor-stale');
        tag.textContent = 'Unavailable'; card.style.setProperty('--fill', '0%');
        document.querySelector('[data-variable-status="' + key + '"]').textContent = 'Unavailable';
        return;
      }

      var percent = Math.max(0, Math.min(100,
        (value - config.min) / (config.max - config.min) * 100
      ));
      var warning = (typeof config.warnLow === 'number' && value < config.warnLow) ||
        (typeof config.warnHigh === 'number' && value > config.warnHigh);
      var sensorTimestamp = data[key + '_timestamp_ms'];
      var sensorStale = typeof sensorTimestamp !== 'number' ||
        Date.now() + serverClockOffset - sensorTimestamp > 3000;
      warningActive = warningActive || warning;
      card.classList.toggle('is-fault', warning);
      card.classList.toggle('sensor-stale', sensorStale);
      tag.textContent = sensorStale ? 'Stale' : warning ? 'Warning' : 'Healthy';
      tag.classList.add('reading-state');
      document.querySelector('[data-variable-status="' + key + '"]').textContent = tag.textContent;
      card.style.setProperty('--fill', percent + '%');
      card.querySelector('.num').textContent = value.toFixed(config.digits);

      var minimum = data[key + '_min'];
      var maximum = data[key + '_max'];
      if (typeof minimum === 'number' && typeof maximum === 'number') {
        var spans = card.querySelectorAll('.range span');
        spans[0].textContent = 'MIN ' + minimum.toFixed(config.digits);
        spans[1].textContent = 'MAX ' + maximum.toFixed(config.digits);
      }
    });
    return warningActive;
  }

  function clearReadings() {
    sensorNames.forEach(function (key) {
      var card = document.querySelector('[data-sensor="' + key + '"]');
      if (!card) return;
      card.classList.remove('is-fault');
      card.classList.add('sensor-stale');
      card.style.setProperty('--fill', '0%');
      card.querySelector('.num').textContent = '—';
      var spans = card.querySelectorAll('.range span');
      spans[0].textContent = 'MIN —';
      spans[1].textContent = 'MAX —';
    });
  }

  function setVisualState(connectionState, warningActive) {
    document.body.classList.remove('state-ok', 'state-fault', 'state-stale', 'state-disconnected');
    if (connectionState === 'disconnected') {
      document.body.classList.add('state-disconnected');
      badge.textContent = 'Disconnected';
      banner.textContent = 'Telemetry disconnected';
    } else if (connectionState === 'stale') {
      document.body.classList.add('state-stale');
      badge.textContent = 'Stale';
      banner.textContent = 'Telemetry stale';
    } else if (warningActive) {
      document.body.classList.add('state-fault');
      badge.textContent = 'Warning';
      banner.textContent = '';
    } else {
      document.body.classList.add('state-ok');
      badge.textContent = 'Active';
      banner.textContent = '';
    }
  }

  function drawGraphs(seconds) {
    sensorNames.forEach(function (key) {
      var view = graphViews[key];
      if (view && !view.box.hidden) view.render(history[key], seconds, Date.now() + serverClockOffset);
    });
  }

  var prefs;
  try { prefs = JSON.parse(localStorage.getItem('eco-racing.graphs.v1')); } catch (_error) { prefs = null; }
  prefs = window.TelemetryGraphs.preferences(prefs, sensorNames);
  var variableList = document.getElementById('variable-list');
  var graphList = document.querySelector('.graph-list');
  graphList.textContent = '';
  sensorNames.forEach(function (key) {
    var config = configs[key];
    var box = document.createElement('article'); box.className = 'graph-box'; box.dataset.graph = key;
    graphList.appendChild(box); graphViews[key] = new window.TelemetryGraphView(box, config);
    var row = document.createElement('div'); row.className = 'variable-row';
    var label = document.createElement('label');
    var checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.select = key;
    label.append(checkbox, document.createTextNode(config.title + ' (' + config.unit + ')'));
    var status = document.createElement('span'); status.dataset.variableStatus = key; status.textContent = 'Unavailable';
    var pin = document.createElement('button'); pin.className = 'btn btn-small'; pin.type = 'button'; pin.dataset.pin = key;
    pin.setAttribute('aria-label', 'Pin ' + config.title);
    row.append(label, status, pin); variableList.appendChild(row);
    checkbox.addEventListener('change', function () { changePreference(key, 'select'); });
    pin.addEventListener('click', function () { changePreference(key, 'pin'); });
  });
  function changePreference(key, action) {
    prefs = window.TelemetryGraphs.toggle(prefs, key, action, sensorNames);
    try { localStorage.setItem('eco-racing.graphs.v1', JSON.stringify(prefs)); } catch (_error) { /* Private mode remains usable. */ }
    applyPreferences();
  }
  function applyPreferences() {
    sensorNames.forEach(function (key) {
      var selected = prefs.selected.includes(key), pinned = prefs.pinned.includes(key);
      var checkbox = document.querySelector('[data-select="' + key + '"]');
      checkbox.checked = selected; checkbox.disabled = pinned || (!selected && prefs.selected.length >= 4);
      var pin = document.querySelector('[data-pin="' + key + '"]');
      pin.textContent = pinned ? 'Unpin' : 'Pin'; pin.setAttribute('aria-pressed', String(pinned));
      pin.disabled = !selected && prefs.selected.length >= 4;
      graphViews[key].box.hidden = !selected;
    });
    prefs.selected.slice().sort(function (a, b) { return Number(prefs.pinned.includes(b)) - Number(prefs.pinned.includes(a)); })
      .forEach(function (key) { graphList.appendChild(graphViews[key].box); });
    document.getElementById('graph-count').textContent = prefs.selected.length + ' of 4 graphs · pinned first';
    document.getElementById('graphs-empty').hidden = prefs.selected.length > 0;
    drawGraphs(configuredSeconds());
  }
  applyPreferences();

  function renderEvents(events) {
    var list = document.getElementById('event-log');
    list.textContent = '';
    (events || []).slice(-50).reverse().forEach(function (event) {
      var item = document.createElement('li');
      item.className = 'log-line log-' + (event.level === 'warn' ? 'warn' : event.level === 'fault' ? 'fault' : 'info');
      var time = document.createElement('time');
      time.textContent = new Date(event.timestamp_ms).toLocaleTimeString('en-GB', { hour12: false });
      var level = document.createElement('span');
      level.className = 'lvl';
      level.textContent = '[' + String(event.level || 'info').toUpperCase() + ']';
      var message = document.createElement('span');
      message.className = 'msg';
      message.textContent = event.message;
      item.append(time, level, message);
      list.appendChild(item);
    });
  }

  function renderLocalEvent(level, message) {
    renderEvents([{ timestamp_ms: Date.now(), level: level, message: message }]);
  }

  function scheduleNextPoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, pollGate.delay(pollMs));
  }

  async function poll() {
    if (!pollGate.begin()) return;
    var succeeded = false;
    try {
      var seconds = configuredSeconds();
      var result = await window.TelemetryAPI.getTelemetry(seconds);
      if (typeof result.status.server_time_ms === 'number') {
        serverClockOffset = result.status.server_time_ms - Date.now();
      }
      if (sessionId !== null && sessionId !== result.status.session_started_ms) {
        sensorNames.forEach(function (key) { history[key] = []; });
      }
      sessionId = result.status.session_started_ms;
      var cutoff = Date.now() + serverClockOffset - 15 * 60 * 1000;
      window.TelemetryModel.mergeHistory(history, result.samples, sensorNames, cutoff);
      var warningActive = updateCards(result.current || {});
      drawGraphs(seconds);
      renderEvents(result.events || []);
      latestSourceTimestamp = result.status.latest_source_timestamp_ms;
      setVisualState(
        window.TelemetryModel.connectionState(true, result.status),
        warningActive
      );
      rateLabel.textContent = (1000 / pollMs).toFixed(1) + ' Hz';
      succeeded = true;
    } catch (error) {
      setVisualState('disconnected', false);
      console.error('Could not get telemetry:', error);
    } finally {
      pollGate.finish(succeeded);
      scheduleNextPoll();
    }
  }

  function pollNow() {
    clearTimeout(pollTimer);
    poll();
  }

  pollingSelect.addEventListener('change', function () {
    pollMs = Math.max(250, 1000 / Number(pollingSelect.value));
    pollNow();
  });
  document.getElementById('settings-refresh').addEventListener('click', function () {
    if (setBackend()) pollNow();
  });
  document.getElementById('status-refresh').addEventListener('click', pollNow);
  rangeSelect.addEventListener('change', function () { drawGraphs(configuredSeconds()); pollNow(); });
  var resizeFrame = 0;
  new ResizeObserver(function () {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(function () { resizeFrame = 0; drawGraphs(configuredSeconds()); });
  }).observe(graphList);

  document.getElementById('btn-clear-session').addEventListener('click', async function () {
    if (!window.confirm('Clear all backend telemetry samples and events for this session?')) return;
    try {
      await window.TelemetryAPI.clearSession();
      sensorNames.forEach(function (key) { history[key] = []; });
      latestSourceTimestamp = null;
      clearReadings();
      drawGraphs(configuredSeconds());
      pollNow();
    } catch (error) {
      renderLocalEvent('fault', 'Could not clear session: ' + error.message);
    }
  });

  document.getElementById('log-clear').addEventListener('click', async function () {
    try {
      await window.TelemetryAPI.clearEvents();
      renderEvents([]);
    } catch (error) {
      renderLocalEvent('fault', 'Could not clear events: ' + error.message);
    }
  });

  setInterval(function () {
    clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    if (latestSourceTimestamp === null) {
      lastUpdate.textContent = 'never';
    } else {
      var ageSeconds = Math.max(0, (Date.now() + serverClockOffset - latestSourceTimestamp) / 1000);
      lastUpdate.textContent = (ageSeconds < 10 ? ageSeconds.toFixed(1) : Math.round(ageSeconds)) + 's ago';
    }
  }, 250);

  clearReadings();
  setBackend();
  setVisualState('disconnected', false);
  pollNow();
})();
