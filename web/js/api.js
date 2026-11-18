/* Small client for the Flask sample telemetry API. */
(function () {
  var base = '';

  function setBase(url) {
    base = (url || '').trim().replace(/\/$/, '');
  }

  async function getTelemetry(seconds) {
    var response = await fetch(
      base + '/api/telemetry?seconds=' + encodeURIComponent(seconds || 60),
      { cache: 'no-store' }
    );
    if (!response.ok) {
      throw new Error('Telemetry API returned ' + response.status);
    }
    return response.json();
  }

  window.TelemetryAPI = {
    setBase: setBase,
    getTelemetry: getTelemetry
  };
})();
