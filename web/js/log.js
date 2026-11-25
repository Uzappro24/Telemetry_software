/* Live event log page controller. */
(function () {
  'use strict';
  var list = document.getElementById('event-log');
  var clock = document.getElementById('clock');
  var polling = false;

  function render(events) {
    list.textContent = '';
    (events || []).slice().reverse().forEach(function (event) {
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

  async function refresh() {
    if (polling) return;
    polling = true;
    try {
      var results = await Promise.all([
        window.TelemetryAPI.getEvents(500),
        window.TelemetryAPI.getStatus()
      ]);
      render(results[0].events);
      var state = results[1].status.state;
      document.body.classList.remove('state-ok', 'state-stale', 'state-disconnected');
      document.body.classList.add(state === 'active' ? 'state-ok' : 'state-' + state);
      document.querySelector('.conn-banner').textContent =
        state === 'stale' ? 'Telemetry stale' : 'Telemetry disconnected';
    } catch (error) {
      document.body.classList.remove('state-ok', 'state-stale');
      document.body.classList.add('state-disconnected');
      console.error('Could not refresh event log:', error);
    } finally {
      polling = false;
      setTimeout(refresh, 2000);
    }
  }

  document.getElementById('log-clear').addEventListener('click', async function () {
    try {
      await window.TelemetryAPI.clearEvents();
      render([]);
    } catch (error) {
      console.error('Could not clear events:', error);
    }
  });
  setInterval(function () {
    clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
  }, 1000);
  refresh();
})();
