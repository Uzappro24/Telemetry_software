/* Requests sample telemetry and updates the dashboard cards and plots. */
(function () {
  var pollMs = 500;
  var history = {};
  var configs = {
    battery_voltage: { min: 42, max: 52, digits: 1, unit: 'V' },
    motor_current: { min: 0, max: 30, digits: 1, unit: 'A' },
    motor_temp: { min: 20, max: 90, digits: 1, unit: '°C' },
    battery_temp: { min: 15, max: 55, digits: 1, unit: '°C' },
    wheel_speed: { min: 0, max: 800, digits: 0, unit: 'RPM' },
    throttle: { min: 0, max: 100, digits: 0, unit: '%' }
  };

  Object.keys(configs).forEach(function (key) {
    history[key] = [];
  });

  var rangeSelect = document.getElementById('time-range');
  var pollingSelect = document.getElementById('polling-rate');
  var backendInput = document.getElementById('backend-ip');
  var rateLabel = document.getElementById('update-rate');
  var lastUpdate = document.getElementById('last-update');
  var clock = document.getElementById('clock');
  var badge = document.getElementById('telemetry-badge');

  function setConnectionState(disconnected) {
    // Keep the visual fault preview in control while it is selected.
    if (document.body.classList.contains('state-fault')) return;
    document.body.classList.toggle('state-disconnected', disconnected);
    document.body.classList.toggle('state-ok', !disconnected);
    badge.textContent = disconnected ? 'Disconnected' : 'Active';
  }

  function setBackend() {
    var value = backendInput.value.trim();

    // The sample server is the same origin as the dashboard. Keep the
    // default ESP32 placeholder on this origin for local sample mode.
    if (!value || value === '192.168.4.1') {
      window.TelemetryAPI.setBase('');
    } else {
      window.TelemetryAPI.setBase(
        /^https?:\/\//i.test(value) ? value : 'http://' + value + ':5000'
      );
    }
  }

  function updateCards(data) {
    Object.keys(configs).forEach(function (key) {
      var config = configs[key];
      var value = data[key];
      var card = document.querySelector('[data-sensor="' + key + '"]');
      if (!card || typeof value !== 'number') return;

      var percent = Math.max(0, Math.min(100,
        (value - config.min) / (config.max - config.min) * 100
      ));
      card.style.setProperty('--fill', percent + '%');
      card.querySelector('.num').textContent = value.toFixed(config.digits);

      var minimum = data[key + '_min'];
      var maximum = data[key + '_max'];
      if (typeof minimum === 'number' && typeof maximum === 'number') {
        card.querySelector('.range').innerHTML =
          '<span>MIN ' + minimum.toFixed(config.digits) + '</span>' +
          '<span>MAX ' + maximum.toFixed(config.digits) + '</span>';
      }
    });
  }

  function drawGraph(box, key, seconds) {
    var points = history[key];
    var config = configs[key];
    var canvas = box.querySelector('canvas');
    var rect = box.getBoundingClientRect();
    var pixelRatio = window.devicePixelRatio || 1;
    var width = Math.max(1, rect.width);
    var height = Math.max(1, rect.height);

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'graph-canvas';
      box.appendChild(canvas);
    }

    if (canvas.width !== Math.round(width * pixelRatio) ||
        canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    }

    var context = canvas.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    var cutoff = Date.now() - seconds * 1000;
    var visible = points.filter(function (point) { return point.time >= cutoff; });
    if (visible.length < 2) return;

    var padding = { top: 26, right: 10, bottom: 10, left: 10 };
    var plotWidth = width - padding.left - padding.right;
    var plotHeight = height - padding.top - padding.bottom;

    context.beginPath();
    visible.forEach(function (point, index) {
      var x = padding.left + index / (visible.length - 1) * plotWidth;
      var y = padding.top + (1 - (point.value - config.min) /
        (config.max - config.min)) * plotHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = '#C6FF3D';
    context.lineWidth = 1.7;
    context.stroke();

    var current = visible[visible.length - 1].value;
    box.querySelector('.graph-label').innerHTML =
      box.dataset.title + ' <b>' + current.toFixed(config.digits) +
      ' ' + config.unit + '</b>';
  }

  function drawGraphs(seconds) {
    document.querySelectorAll('.graph-box').forEach(function (box) {
      drawGraph(box, box.dataset.graph, seconds);
    });
  }

  async function poll() {
    try {
      var seconds = Number(rangeSelect.value) || 60;
      var result = await window.TelemetryAPI.getTelemetry(seconds);
      var sample = result.current;

      updateCards(sample);
      Object.keys(configs).forEach(function (key) {
        history[key].push({ time: sample.timestamp_ms, value: sample[key] });
        var oldestToKeep = Date.now() - 15 * 60 * 1000;
        history[key] = history[key].filter(function (point) {
          return point.time >= oldestToKeep;
        });
      });

      drawGraphs(seconds);
      setConnectionState(false);
      lastUpdate.textContent = '0';
      rateLabel.textContent = (1000 / pollMs).toFixed(1) + ' Hz';
      clock.textContent = new Date().toLocaleTimeString('en-GB', {
        hour12: false
      });
    } catch (error) {
      setConnectionState(true);
      console.error('Could not get telemetry:', error);
    }
  }

  document.querySelectorAll('.graph-box').forEach(function (box) {
    box.dataset.title = box.querySelector('.graph-label').childNodes[0].textContent.trim();
  });

  pollingSelect.addEventListener('change', function () {
    pollMs = Math.max(250, 1000 / Number(pollingSelect.value));
    clearInterval(window.telemetryTimer);
    window.telemetryTimer = setInterval(poll, pollMs);
    poll();
  });

  document.getElementById('settings-refresh').addEventListener('click', function () {
    setBackend();
    poll();
  });

  rangeSelect.addEventListener('change', function () {
    drawGraphs(Number(rangeSelect.value));
  });

  window.addEventListener('resize', function () {
    drawGraphs(Number(rangeSelect.value));
  });

  document.getElementById('btn-clear-session').addEventListener('click', function () {
    Object.keys(history).forEach(function (key) { history[key] = []; });
    drawGraphs(Number(rangeSelect.value));
  });

  setBackend();
  poll();
  window.telemetryTimer = setInterval(poll, pollMs);
})();
