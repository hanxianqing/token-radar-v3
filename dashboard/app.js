// Token Radar dashboard — renders the ranked board from window.RADAR (data.js).
// Everything on the page derives from that one dataset: the board, the filters,
// the detail drawer, the model sandbox and the live-token comparison.
//
// The submitted board always uses the fitted weights (growth 0.25, maturity
// range 0.20). The sandbox below only re-ranks the view in the browser, so a
// reader can feel how much the two adjustments matter; it never rewrites data.

(function () {
  'use strict';

  var DATA = window.RADAR;
  var rows = DATA.rows;
  var fitted = { growth: DATA.model.growth_weight, maturity: DATA.model.maturity_range };

  // ---- view state -------------------------------------------------------
  var state = {
    status: 'pre-token', // the launch-candidate board is the default view
    query: '',
    chain: '',
    category: '',
    sortKey: 'implied',
    sortDir: -1, // -1 = descending, 1 = ascending
    growthW: fitted.growth,
    maturityR: fitted.maturity,
    openSlug: null,
  };

  // ---- small formatting helpers ----------------------------------------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Compact dollars: $2.76B, $96.8M, $512K, $87.
  function compactUsd(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function fullUsd(v) {
    if (v === null || v === undefined) return 'No token recorded';
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  function signedPct(v, digits) {
    if (v === null || v === undefined) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(digits === undefined ? 1 : digits) + '%';
  }
  function ageLabel(days) {
    if (days === null || days === undefined) return '—';
    return (days / 365).toFixed(1) + 'y';
  }
  function chainLabel(chains) {
    if (chains.length <= 3) return chains.join(', ');
    return chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3);
  }
  function statusLabel(status) {
    return status === 'pre-token' ? 'Pre-token' : status === 'live' ? 'Live' : 'Excluded';
  }

  // ---- the sandbox value: the model's fitted log, re-weighted -----------
  // data.js carries the fitted multipliers, so the two inputs can be
  // recovered: growth% = (growthMultiplier - 1) / fittedGrowth * 100 and the
  // maturity fraction = (maturityMultiplier - 0.9) / fittedRange.
  function sandboxValue(row) {
    if (row.token_status === 'excluded') return 1;
    var growthPct = ((row.growth_multiplier - 1) / fitted.growth) * 100;
    var ageFrac = (row.maturity_multiplier - DATA.model.maturity_floor) / fitted.maturity;
    var base = Math.pow(10, row.fitted_log_value);
    return base * (1 + (state.growthW * growthPct) / 100) * (DATA.model.maturity_floor + state.maturityR * ageFrac);
  }
  function sandboxActive() {
    return state.growthW !== fitted.growth || state.maturityR !== fitted.maturity;
  }

  // ---- filtering and sorting --------------------------------------------
  function visibleRows() {
    var q = state.query.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.status === 'watchlist') {
        if (!r.watchlist) return false;
      } else if (state.status !== 'all' && r.token_status !== state.status) {
        return false;
      }
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.category && r.category !== state.category) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sortKey;
    var dir = state.sortDir;
    var val = function (r) {
      switch (key) {
        case 'rank': return r.rank;
        case 'name': return r.name.toLowerCase();
        case 'tvl': return r.tvl_usd;
        case 'change': return r.change_7d === null ? -Infinity : r.change_7d;
        case 'age': return r.age_days === null ? -Infinity : r.age_days;
        case 'odds': return r.launch_odds;
        case 'implied': return sandboxActive() ? sandboxValue(r) : r.implied_value_usd;
        default: return r.implied_value_usd;
      }
    };
    list.sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return list;
  }

  // ---- board table --------------------------------------------------------
  var tbody = document.getElementById('board-body');
  var showing = document.getElementById('showing');

  function rowHtml(r, pos) {
    var shown = sandboxActive() ? Math.round(sandboxValue(r)) : r.implied_value_usd;
    var watch = r.watchlist ? ' <span class="tag-watch">Watchlist</span>' : '';
    return '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
      '<td class="num">' + pos + '</td>' +
      '<td><div class="cell-name">' + esc(r.name) + watch + '</div><div class="cell-slug">' + esc(r.slug) + '</div></td>' +
      '<td><span class="pill pill-' + r.token_status + '">' + statusLabel(r.token_status) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc(chainLabel(r.chains)) + '</td>' +
      '<td class="num">' + compactUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down') + '">' + signedPct(r.change_7d) + '</td>' +
      '<td class="num">' + ageLabel(r.age_days) + '</td>' +
      '<td class="num strong">' + compactUsd(shown) + '</td>' +
      '<td class="num">' + Math.round(r.launch_odds * 100) + '%</td>' +
      '</tr>';
  }

  function renderBoard() {
    var list = visibleRows();
    var html = '';
    for (var i = 0; i < list.length; i++) html += rowHtml(list[i], i + 1);
    tbody.innerHTML = html;
    var note = 'Showing ' + list.length + ' of ' + rows.length + ' protocols. Click a row for its detail and farm plan.';
    if (sandboxActive()) note += ' Sandbox weights in effect — the submitted board uses the fitted weights.';
    showing.textContent = note;
    markSortHeaders();
  }

  function markSortHeaders() {
    var ths = document.querySelectorAll('#board-table th[data-sort]');
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i];
      var base = th.getAttribute('data-label');
      th.textContent = base + (th.getAttribute('data-sort') === state.sortKey ? (state.sortDir === -1 ? ' ▼' : ' ▲') : '');
    }
  }

  // ---- detail drawer ------------------------------------------------------
  var detail = document.getElementById('detail');
  var detailBody = document.getElementById('detail-body');

  function stepHtml(step, i) {
    var safe = esc(step)
      .replace(/Cost:/g, '<strong>Cost:</strong>')
      .replace(/Time:/g, '<strong>Time:</strong>');
    return '<li><span class="step-no">' + (i + 1) + '.</span> ' + safe + '</li>';
  }

  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) return;
    state.openSlug = slug;
    var pre = Math.round(Math.pow(10, r.fitted_log_value));
    var buildLine = 'Fitted log value ' + r.fitted_log_value.toFixed(3) +
      ' (~ ' + fullUsd(pre) + ' before adjustments); momentum ×' + r.growth_multiplier.toFixed(3) +
      ', maturity ×' + r.maturity_multiplier.toFixed(3) + ' → ' + fullUsd(r.raw_prediction_usd) + '.';
    var capLine = r.token_status === 'live'
      ? '<p><strong>Market cap ' + fullUsd(r.mcap_usd) + '</strong> against a fitted value of ' +
        fullUsd(r.raw_prediction_usd) + ' — the market&rsquo;s number and the model&rsquo;s are never confused.</p>'
      : '';
    var floorLine = r.token_status === 'excluded'
      ? '<p class="note-excluded">Excluded: ' + esc(r.exclusion_reason || '') +
        '. Its launch value is the $1 floor, but the model prediction (' + fullUsd(r.raw_prediction_usd) +
        ') is still shown, so all ' + rows.length + ' protocols are accounted for.</p>'
      : '';
    var steps = r.farm_steps.map(stepHtml).join('');
    detailBody.innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="detail-sub"><span class="pill pill-' + r.token_status + '">' + statusLabel(r.token_status) + '</span> ' +
      'Rank ' + r.rank + ' of ' + rows.length + ' &nbsp; ' + esc(r.category || '') +
      (r.watchlist ? ' &nbsp; <span class="tag-watch">Watchlist</span>' : '') + '</p>' +
      '<p class="detail-value">' + fullUsd(r.implied_value_usd) + '</p>' +
      '<p>Implied value. 80% held-out interval ' + compactUsd(r.interval_low_usd) + ' – ' + compactUsd(r.interval_high_usd) +
      '. Launch odds ' + Math.round(r.launch_odds * 100) +
      '% (share of similar protocols that record a token).</p>' +
      '<h3>Protocol</h3>' +
      '<dl class="facts">' +
      '<div><dt>TVL</dt><dd>' + fullUsd(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + signedPct(r.change_7d) + '</dd></div>' +
      '<div><dt>Market cap</dt><dd>' + fullUsd(r.mcap_usd) + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + esc(r.chains.join(', ')) + '</dd></div>' +
      '<div><dt>Listed</dt><dd>' + (r.listed_at || 'Not recorded') + '</dd></div>' +
      '<div><dt>Age</dt><dd>' + ageLabel(r.age_days) + '</dd></div>' +
      '</dl>' +
      '<h3>How the value is built</h3><p>' + buildLine + '</p>' + capLine + floorLine +
      '<h3>Farm plan — seven steps, costed</h3><ol class="farm">' + steps + '</ol>';
    detail.removeAttribute('hidden');
  }

  function closeDetail() {
    state.openSlug = null;
    detail.setAttribute('hidden', '');
  }

  tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  tbody.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var tr = ev.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeDetail();
  });

  // ---- filters --------------------------------------------------------------
  function setStatus(status, btn) {
    state.status = status;
    var btns = document.querySelectorAll('[data-status]');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i] === btn);
    renderBoard();
  }
  var statusBtns = document.querySelectorAll('[data-status]');
  for (var b = 0; b < statusBtns.length; b++) {
    statusBtns[b].addEventListener('click', function () { setStatus(this.getAttribute('data-status'), this); });
  }

  document.getElementById('search').addEventListener('input', function () {
    state.query = this.value;
    renderBoard();
  });

  function fillSelect(id, values) {
    var sel = document.getElementById(id);
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  }
  var chainSet = {}, catSet = {};
  rows.forEach(function (r) {
    r.chains.forEach(function (c) { chainSet[c] = true; });
    if (r.category) catSet[r.category] = true;
  });
  fillSelect('chain-filter', Object.keys(chainSet).sort());
  fillSelect('category-filter', Object.keys(catSet).sort());
  document.getElementById('chain-filter').addEventListener('change', function () {
    state.chain = this.value;
    renderBoard();
  });
  document.getElementById('category-filter').addEventListener('change', function () {
    state.category = this.value;
    renderBoard();
  });

  // ---- sorting ---------------------------------------------------------------
  var headers = document.querySelectorAll('#board-table th[data-sort]');
  for (var h = 0; h < headers.length; h++) {
    headers[h].addEventListener('click', function () {
      var key = this.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = -state.sortDir;
      } else {
        state.sortKey = key;
        state.sortDir = key === 'name' ? 1 : -1;
      }
      renderBoard();
    });
  }

  // ---- model sandbox ----------------------------------------------------------
  var growthInput = document.getElementById('sandbox-growth');
  var maturityInput = document.getElementById('sandbox-maturity');
  var growthOut = document.getElementById('sandbox-growth-val');
  var maturityOut = document.getElementById('sandbox-maturity-val');

  function syncSandbox() {
    growthInput.value = state.growthW;
    maturityInput.value = state.maturityR;
    growthOut.textContent = state.growthW.toFixed(2);
    maturityOut.textContent = state.maturityR.toFixed(2);
  }
  growthInput.addEventListener('input', function () {
    state.growthW = parseFloat(this.value);
    growthOut.textContent = state.growthW.toFixed(2);
    renderBoard();
  });
  maturityInput.addEventListener('input', function () {
    state.maturityR = parseFloat(this.value);
    maturityOut.textContent = state.maturityR.toFixed(2);
    renderBoard();
  });
  document.getElementById('sandbox-reset').addEventListener('click', function () {
    state.growthW = fitted.growth;
    state.maturityR = fitted.maturity;
    syncSandbox();
    renderBoard();
  });
  syncSandbox();

  // ---- live-token comparison (top 24 by market cap) ---------------------------
  (function renderLiveCheck() {
    var wrap = document.getElementById('live-check-body');
    var html = '';
    DATA.live.forEach(function (r) {
      var ratio = r.mcap_usd ? (r.implied_value_usd / r.mcap_usd) : null;
      html += '<tr><td>' + esc(r.name) + '</td><td class="num">' + compactUsd(r.mcap_usd) +
        '</td><td class="num">' + compactUsd(r.implied_value_usd) + '</td><td class="num">' +
        (ratio === null ? '—' : ratio.toFixed(2) + '×') + '</td></tr>';
    });
    wrap.innerHTML = html;
  })();

  // ---- first paint --------------------------------------------------------------
  renderBoard();
})();
