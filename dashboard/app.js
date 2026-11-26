// Token Radar's dashboard: the board, its filters, its detail view and its model sandbox.
// Reads window.RADAR (written by main.ts from the same board). No fetch, no network.
(function () {
  'use strict';
  var D = window.RADAR;
  var body = document.getElementById('board-body');
  if (!D) { body.innerHTML = '<tr><td colspan="10">No radar data.</td></tr>'; return; }
  var rows = D.rows;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtMoney(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return '$' + Math.round(n);
  }
  function fmtFull(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtPct(v) {
    if (v == null) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '') + '">' + s + '</span>';
  }
  function fmtAge(d) { return d == null ? '—' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; }
  function statusPill(r) {
    if (r.token_status === 'pre-token') return '<span class="badge pre-token">Pre-token</span>';
    if (r.token_status === 'live') return '<span class="badge live">Live token</span>';
    return '<span class="badge excluded">Excluded</span>';
  }

  // ---- header numbers -------------------------------------------------------
  function stat(n, label) { return '<div class="kpi"><b>' + n + '</b><span>' + label + '</span></div>'; }
  document.getElementById('kpis').innerHTML =
    stat(D.board_size, 'protocols ranked') +
    stat(D.watchlist_size, 'on the watchlist') +
    stat(D.pre_token_size, 'launch candidates') +
    stat(D.live_size, 'live tokens') +
    stat(D.excluded_size, 'excluded');

  // ---- model panel ----------------------------------------------------------
  var m = D.model, v = D.validation;
  var sign = m.log_chains < 0 ? '− ' : '+ ';
  document.getElementById('model-formula').innerHTML =
    'Trimmed least squares on <b>' + m.peers_kept + ' of ' + m.peers + ' tokened peers</b> ' +
    '(five dust listings and ten chains / centralised exchanges left out — their TVL is not comparable; ' +
    'then the ' + m.peers_trimmed + ' worst-fitting peers trimmed before the refit — see MODEL.md): ' +
    '<code>log10(market cap) = ' + m.intercept + ' + ' + m.log_tvl + ' × log10(TVL) ' + sign + Math.abs(m.log_chains) + ' × log10(chains)</code>, ' +
    'R² = ' + m.r2 + ' on all ' + m.peers + ' peers (' + m.r2_kept + ' on the ' + m.peers_kept + ' kept). ' +
    'Two bounded adjustments follow: momentum × (1 + ' + m.growth_weight + ' × 7-day growth, clipped to ' +
    m.growth_floor + '%…+' + m.growth_cap + '%) and maturity × (' + m.maturity_floor + ' + ' + m.maturity_range + ' × min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days + 'd).';
  document.getElementById('model-validation').innerHTML =
    'Held out, before it scored anything: leave-one-out median error <b>×' + v.loo_median_multiple + '</b> (' +
    Math.round(v.loo_within_2x * 100) + '% within 2×, n=' + v.loo_n + '); walk-forward median <b>×' + v.walk_forward_70_median_multiple + '</b> ' +
    '(fitted on protocols listed up to ' + v.walk_forward_70_cutoff + ', tested on the ' + v.walk_forward_70_test + ' listed after it; ' +
    'the 60/40 split gives ×' + v.walk_forward_60_median_multiple + '); 80% held-out interval <b>×' + v.conformal_80_factor + '</b> around every value. ' +
    'Token values vary widely around TVL-implied levels — the interval says so instead of hiding it.';
  document.getElementById('model-coverage').innerHTML =
    'Coverage: <b>' + D.board_size + ' protocols</b> — ' + D.pre_token_size + ' launch candidates, ' + D.live_size +
    ' live tokens, ' + D.excluded_size + ' excluded (wrapped, staked, bridged, exchange or versioned products, carried at the $1 floor so the ranking stays a launch ranking; each still shows its model prediction). ' +
    'Watchlist: all ' + D.watchlist_size + ' covered. Snapshot: ' + esc(D.as_of) + '.';

  // ---- filter state -----------------------------------------------------------
  var view = { status: 'pre-token', chain: '', category: '', q: '', sort: 'rank', dir: 1, sandbox: null };
  var chainSel = document.getElementById('f-chain');
  var catSel = document.getElementById('f-category');
  var chainCounts = {}, catCounts = {};
  rows.forEach(function (r) {
    r.chains.forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; });
    var cat = r.category || 'No category';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).forEach(function (c) {
    chainSel.add(new Option(c + ' (' + chainCounts[c] + ')', c));
  });
  Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; }).forEach(function (c) {
    catSel.add(new Option(c + ' (' + catCounts[c] + ')', c === 'No category' ? '' : c));
  });

  function growthShare(r) { return (r.growth_multiplier - 1) / 0.25; }
  function valueUnder(r) {
    if (r.token_status === 'excluded') return 1;
    if (!view.sandbox) return r.implied_value_usd;
    var age = r.age_days == null ? 365 : r.age_days;
    var g = 1 + view.sandbox.gw * growthShare(r);
    var mat = 0.9 + view.sandbox.mr * (Math.min(Math.max(age, 0), 1095) / 1095);
    return Math.max(1, Math.round(Math.pow(10, r.fitted_log_value) * g * mat));
  }

  function visibleRows() {
    var q = view.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (view.status === 'watchlist') { if (!r.watchlist) return false; }
      else if (view.status !== 'all' && r.token_status !== view.status) return false;
      if (view.chain && r.chains.indexOf(view.chain) < 0) return false;
      if (view.category && (r.category || '') !== view.category) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var k = view.sort, dir = view.dir;
    function cell(r) {
      if (k === 'implied_value_usd') return valueUnder(r);
      if (k === 'rank') return view.sandbox ? -valueUnder(r) : r.rank;
      var x = r[k];
      if (x == null) return k === 'name' || k === 'category' ? '' : -Infinity;
      return x;
    }
    list.sort(function (a, b) {
      var x = cell(a), y = cell(b);
      var c = x < y ? -1 : x > y ? 1 : (a.slug < b.slug ? -1 : 1);
      return c * dir;
    });
    return list;
  }

  var countEl = document.getElementById('result-count');
  function render() {
    var list = visibleRows();
    countEl.textContent = 'Showing ' + list.length + ' of ' + rows.length + ' protocols' +
      (view.sandbox ? ' — sandbox weights on, re-ranked' : '') + '. Click a row for its detail and farm plan.';
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td class="name"><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="watch-tag">WATCHLIST</span>' : '') + '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + statusPill(r) + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')) + '</td>' +
        '<td class="num">' + fmtMoney(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><b>' + fmtMoney(valueUnder(r)) + '</b></td>' +
        '<td class="num">' + (r.launch_odds == null ? '—' : Math.round(r.launch_odds * 100) + '%') + '</td>' +
        '</tr>';
    }
    body.innerHTML = html || '<tr><td colspan="10">Nothing matches these filters.</td></tr>';
    document.querySelectorAll('th[data-sort]').forEach(function (th) {
      var k = th.getAttribute('data-sort');
      th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (k === view.sort ? (view.dir === 1 ? ' ▲' : ' ▼') : '');
    });
  }

  // ---- detail drawer ----------------------------------------------------------
  var detail = document.getElementById('detail');
  var detailBody = document.getElementById('detail-body');
  function findRow(slug) {
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i];
    return null;
  }
  function openDetail(slug) {
    var r = findRow(slug);
    if (!r) return;
    var marketNote = '';
    if (r.token_status === 'live' && r.mcap_usd != null) {
      var ratio = r.mcap_usd / r.raw_prediction_usd;
      marketNote = '<p>Market value ' + fmtFull(r.mcap_usd) + ' against a model fair value of ' + fmtFull(r.raw_prediction_usd) +
        ': the market prices it at <b>' + ratio.toFixed(2) + '×</b> the fitted value.</p>';
    }
    var floorNote = '';
    if (r.token_status === 'excluded') {
      floorNote = '<p class="why">Why $1: this protocol is ' + esc(r.exclusion_reason || 'not a standalone launch candidate') +
        '. It cannot launch a token of its own, so its launch value is the $1 floor — but it is still listed, with its model prediction of ' +
        fmtFull(r.raw_prediction_usd) + ', so all ' + D.board_size + ' protocols are accounted for.</p>';
    }
    var steps = r.farm_steps.map(function (s) {
      return '<li>' + esc(s).replace(/ Cost: /g, ' <b>Cost:</b> ').replace(/ Time: /g, ' <b>Time:</b> ') + '</li>';
    }).join('');
    var intervalLine = r.token_status === 'excluded'
      ? '<p class="interval">Implied value is the $1 floor (see why below). Model prediction ' + fmtFull(r.raw_prediction_usd) + '. Launch odds ' + Math.round(r.launch_odds * 100) + '%.</p>'
      : '<p class="interval">Implied value. 80% held-out interval ' + fmtMoney(r.interval_low_usd) + ' – ' + fmtMoney(r.interval_high_usd) +
        '. Launch odds ' + Math.round(r.launch_odds * 100) + '% (share of similar protocols that record a token).</p>';
    detailBody.innerHTML =
      '<h2>' + esc(r.name) + ' ' + (r.watchlist ? '<span class="star">★</span>' : '') + '</h2>' +
      '<p>' + statusPill(r) + ' &nbsp; Rank ' + r.rank + ' of ' + rows.length + ' &nbsp; ' + esc(r.category || 'No category') + '</p>' +
      '<div class="big">' + fmtFull(valueUnder(r)) + '</div>' +
      intervalLine +
      floorNote + marketNote +
      '<h3>Protocol</h3><div class="facts">' +
      '<div><b>TVL</b>' + fmtFull(r.tvl_usd) + '</div>' +
      '<div><b>7-day change</b>' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</div>' +
      '<div><b>Market cap</b>' + (r.mcap_usd == null ? (r.token_status === 'live' ? 'Token recorded, no cap in snapshot' : 'No token recorded') : fmtFull(r.mcap_usd)) + '</div>' +
      '<div><b>Chains</b>' + esc(r.chains.join(', ') || '—') + '</div>' +
      '<div><b>Listed</b>' + esc(r.listed_at || 'Not recorded') + '</div>' +
      '<div><b>Age</b>' + fmtAge(r.age_days) + '</div>' +
      '</div>' +
      '<h3>How the value is built</h3>' +
      '<p>Fitted log value ' + r.fitted_log_value.toFixed(3) + ' (→ ' + fmtFull(Math.pow(10, r.fitted_log_value)) +
      ' before adjustments); momentum ×' + r.growth_multiplier.toFixed(3) + ', maturity ×' + r.maturity_multiplier.toFixed(3) +
      ' → ' + fmtFull(r.raw_prediction_usd) + '.</p>' +
      '<h3>Farm plan — seven steps, costed</h3><ol>' + steps + '</ol>' +
      '<p class="interval">Gas figures are estimates for ' + esc(r.chains[0] || 'the protocol’s main chain') + '. Claim only from the protocol’s own pages; never pay to claim.</p>';
    detail.hidden = false;
  }
  body.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  document.getElementById('detail-close').addEventListener('click', function () { detail.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') detail.hidden = true; });

  // ---- controls ----------------------------------------------------------------
  document.querySelectorAll('#status-chips button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#status-chips button').forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      view.status = btn.getAttribute('data-status');
      render();
    });
  });
  chainSel.addEventListener('change', function () { view.chain = chainSel.value; render(); });
  catSel.addEventListener('change', function () { view.category = catSel.value; render(); });
  document.getElementById('search').addEventListener('input', function (e) { view.q = e.target.value; render(); });
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (view.sort === k) view.dir = -view.dir;
      else { view.sort = k; view.dir = k === 'name' || k === 'category' ? 1 : -1; }
      render();
    });
  });

  // ---- sandbox ------------------------------------------------------------------
  var sbGrowth = document.getElementById('sb-growth');
  var sbMaturity = document.getElementById('sb-maturity');
  function applySandbox() {
    var gw = parseFloat(sbGrowth.value), mr = parseFloat(sbMaturity.value);
    document.getElementById('sb-growth-val').textContent = gw.toFixed(2);
    document.getElementById('sb-maturity-val').textContent = mr.toFixed(2);
    view.sandbox = (Math.abs(gw - 0.25) < 1e-9 && Math.abs(mr - 0.2) < 1e-9) ? null : { gw: gw, mr: mr };
    document.getElementById('sb-note').textContent = view.sandbox
      ? 'Sandbox on: growth weight ' + gw.toFixed(2) + ', maturity range ' + mr.toFixed(2) + ' — the board is re-ranked under your weights.'
      : 'Re-ranks the board under your weights; the submitted board uses the fitted ones.';
    render();
  }
  sbGrowth.addEventListener('input', applySandbox);
  sbMaturity.addEventListener('input', applySandbox);
  document.getElementById('sb-reset').addEventListener('click', function () {
    sbGrowth.value = '0.25'; sbMaturity.value = '0.2'; applySandbox();
  });

  render();
})();
