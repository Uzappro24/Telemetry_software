/*
 * dev-toggle.js: TEMPORARY development helper.
 *
 * Adds three buttons in the bottom-right corner to preview the
 * normal / fault / disconnected visual states. It only swaps the
 * state class on <body> (and marks one example card as faulty).
 * You can also open index.html#fault or index.html#disconnected.
 * Remove the <script> tag that loads this file before race day.
 */
(function () {
  var STATES = { normal: 'state-ok', fault: 'state-fault', disconnected: 'state-disconnected' };
  var EXAMPLE_FAULT_CARD = '[data-sensor="motor_temp"]';

  var bar = document.createElement('div');
  bar.className = 'dev-toggle';

  Object.keys(STATES).forEach(function (name) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.onclick = function () { setState(name); };
    bar.appendChild(b);
  });
  document.body.appendChild(bar);

  function setState(name) {
    var body = document.body;
    body.classList.remove('state-ok', 'state-fault', 'state-disconnected');
    body.classList.add(STATES[name]);

    var card = document.querySelector(EXAMPLE_FAULT_CARD);
    if (card) card.classList.toggle('is-fault', name === 'fault');

    bar.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.textContent === name);
    });
  }

  // Start in the state named in the URL hash, e.g. index.html#fault
  var initial = location.hash.slice(1);
  setState(STATES[initial] ? initial : 'normal');
})();
