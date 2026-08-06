/**
 * hours-badge.js — Real-time Open / Closed status badge
 * Calculates open/closed state from business hours and updates every minute.
 * Call: initHoursBadge('elementId', hoursObject)
 */
(function () {
  'use strict';

  var DAY_KEYS   = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function fmt12(hhmm) {
    var parts = hhmm.split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return m === '00' ? h + ampm : h + ':' + m + ' ' + ampm;
  }

  function timeToMins(hhmm) {
    var parts = hhmm.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function getNextOpen(hours, fromIdx) {
    for (var i = 1; i <= 7; i++) {
      var idx = (fromIdx + i) % 7;
      var h = hours[DAY_KEYS[idx]];
      if (h && !h.closed) {
        var prefix = i === 1 ? 'OPENS TOMORROW ' : ('OPENS ' + DAY_LABELS[idx].toUpperCase() + ' ');
        return prefix + fmt12(h.open);
      }
    }
    return 'TEMPORARILY CLOSED';
  }

  function getStatus(hours) {
    var now         = new Date();
    var dayIdx      = now.getDay();
    var currentMins = now.getHours() * 60 + now.getMinutes();
    var today       = hours[DAY_KEYS[dayIdx]];

    if (!today || today.closed) {
      return { open: false, label: getNextOpen(hours, dayIdx) };
    }

    var openMins  = timeToMins(today.open);
    var closeMins = timeToMins(today.close);

    if (currentMins >= openMins && currentMins < closeMins) {
      return { open: true, closesAt: fmt12(today.close) };
    } else if (currentMins < openMins) {
      return { open: false, label: 'OPENS ' + fmt12(today.open) };
    } else {
      return { open: false, label: getNextOpen(hours, dayIdx) };
    }
  }

  function render(el, hours) {
    var status = getStatus(hours);
    var dot    = el.querySelector('.hb-dot');
    var text   = el.querySelector('.hb-text');
    if (!dot || !text) return;

    if (status.open) {
      el.classList.add('hb--open');
      el.classList.remove('hb--closed');
      text.textContent = 'OPEN';
    } else {
      el.classList.remove('hb--open');
      el.classList.add('hb--closed');
      text.textContent = 'CLOSED' + (status.label ? ' · ' + status.label : '');
    }
  }

  window.initHoursBadge = function (elId, hours) {
    var el = document.getElementById(elId);
    if (!el) return;
    render(el, hours);
    setInterval(function () { render(el, hours); }, 60000);
  };
})();
