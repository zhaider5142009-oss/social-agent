const $ = (id) => document.getElementById(id);
const state = { data: null };

const VIEWS = ['dashboard', 'analytics', 'connectors', 'inbox', 'brain', 'growth', 'viral', 'activity', 'settings'];

async function fetchJson(url, opts) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fmt(n) {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 10_000) return 'just now';
  if (d < 60_000) return Math.floor(d / 1000) + 's ago';
  if (d < 3_600_000) return Math.floor(d / 60_000) + 'm ago';
  return new Date(ts).toLocaleTimeString();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
function toast(msg, isErr) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

/* ---------------- View switching ---------------- */
function switchView(name) {
  if (!VIEWS.includes(name)) name = 'dashboard';
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  state.view = name;
}

/* ---------------- Navigation events ---------------- */
document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
$('sideToggle').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));

/* ---------------- Render: dashboard ---------------- */
function renderKPIs(d) {
  const t = d.totals;
  $('kpis').innerHTML = `
    <div class="kpi"><div class="num">${fmt(t.followers)}</div><div class="label">Followers</div><div class="delta up">AI-driven growth</div></div>
    <div class="kpi"><div class="num">${t.posts}</div><div class="label">Posts</div><div class="delta flat">auto + manual</div></div>
    <div class="kpi"><div class="num">${t.replies}</div><div class="label">Replies (humanized)</div><div class="delta flat">extreme human touch</div></div>
    <div class="kpi"><div class="num">${Object.keys(d.platforms || {}).length}</div><div class="label">Platforms</div><div class="delta flat">${(d.aiUsage && d.aiUsage.provider) || 'ai'}</div></div>
    <div class="kpi"><div class="num">${(d.aiUsage && d.aiUsage.calls) || 0}</div><div class="label">AI calls</div><div class="delta flat">${(d.aiUsage && d.aiUsage.fallbacks) || 0} fallbacks</div></div>`;
}

function renderPlatforms(d) {
  const el = $('platforms');
  const plats = d.platforms || {};
  if (!Object.keys(plats).length) { el.innerHTML = '<div class="muted">Connecting platforms…</div>'; return; }
  el.innerHTML = Object.entries(plats).map(([name, p]) => {
    const meta = (d.platformMeta && d.platformMeta[name]) || {};
    const mode = p.mode || 'sim';
    return `<div class="platform">
      <div class="name"><span class="dot ${p.connected ? '' : 'off'}"></span>${escapeHtml(meta.label || name)}</div>
      <div class="handle">${escapeHtml(meta.handle || p.handle || '')}</div>
      <div class="stats"><span>Followers</span><b>${fmt(p.followers || 0)}</b></div>
      <div class="stats"><span>Posts</span><b>${p.posts || 0}</b></div>
      <div class="stats"><span>Engagement</span><b>${(p.engagement || 0).toFixed(1)}%</b></div>
      <span class="mode mode-${mode}">${mode}</span>
    </div>`;
  }).join('');
}

function renderPosts(d) {
  const posts = (d.posts || []).slice(0, 8);
  $('postsList').innerHTML = posts.length
    ? posts.map((p) => `
      <div class="post-item">
        <div class="post-meta"><b>${escapeHtml(p.platform)}</b><span>${timeAgo(p.ts)}</span><span class="via">via ${escapeHtml(p.via || '?')}</span>${p.gain ? `<span>+${p.gain} followers</span>` : ''}</div>
        <div>${escapeHtml(p.text)}</div>
      </div>`).join('')
    : '<div class="muted">No posts yet — let the AI create some.</div>';
}

/* ---------------- Render: connectors ---------------- */
function renderConnectors(d) {
  const conns = d.connectorMeta || {};
  const keys = Object.keys(conns);
  if (!keys.length) { $('connectors').innerHTML = '<div class="muted">No connectors registered.</div>'; return; }
  const connected = keys.filter((k) => conns[k].connected).length;
  $('connBadge').textContent = connected + '/' + keys.length;

  $('connectors').innerHTML = keys.map((name) => {
    const c = conns[name];
    const isLive = c.mode === 'rest' || c.mode === 'mcp';
    const inSim = c.mode === 'sim' && c.connected;
    let stateChip;
    if (isLive) stateChip = `<span class="conn-state ok"><span class="dot"></span>Connected</span>`;
    else if (inSim) stateChip = `<span class="conn-state sim"><span class="dot"></span>Demo mode</span>`;
    else stateChip = `<button class="btn btn-primary conn-connect" data-name="${name}">Connect</button>`;

    return `<div class="connector ${isLive ? 'live' : ''}">
      <div class="conn-head">
        <div class="conn-id"><span class="conn-logo">${escapeHtml(c.label[0])}</span><div><span class="conn-title">${escapeHtml(c.label)}</span><span class="conn-handle">${escapeHtml(c.handle)}</span></div></div>
        ${stateChip}
      </div>
      <div class="conn-task">${escapeHtml(c.task)}</div>
      <div class="conn-foot">
        <span class="conn-mode">${c.mode === 'mcp' ? 'MCP' : c.mode === 'rest' ? 'Live' : 'Simulation'}</span>
        <a href="${escapeHtml(c.link)}" target="_blank" rel="noopener" class="conn-link">Get API access →</a>
      </div>
      <div class="conn-panel" hidden>
        <div class="conn-panel-tip">Paste the credential(s) below. The agent will store them locally and activate <b>${escapeHtml(c.label)}</b> for live posting + replies.</div>
        ${c.creds.map((f) => `
          <label class="cred">${escapeHtml(f.label)}</label>
          <input type="password" data-key="${f.key}" autocomplete="new-password"
            placeholder="${escapeHtml(f.placeholder)}" ${f.set ? `value="••••••••"` : ''} />
        `).join('')}
        <div class="conn-actions">
          <button class="btn btn-primary conn-save" data-name="${name}">Save &amp; connect</button>
          <button class="btn conn-test" data-name="${name}">Test connection</button>
          <button class="btn conn-cancel">Cancel</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- Render: inbox ---------------- */
function renderInbox(d) {
  const items = d.inbox || [];
  const n = items.filter((m) => m.status === 'new').length;
  $('inboxBadge').textContent = n;
  const convs = d.conversations || {};
  if (!items.length) { $('inboxBox').innerHTML = '<div class="empty muted">No messages yet — they arrive while the agent runs.</div>'; return; }
  $('inboxBox').innerHTML = items.slice(0, 20).map((m) => {
    const ti = m.threadId || `${m.platform}:${m.from || 'anon'}`;
    const thread = convs[ti]?.messages || [];
    const history = thread.length > 1
      ? `<div class="thread-context">${thread.slice(0, -1).map((t) =>
          `<div class="${t.role === 'out' ? 't-out' : 't-in'}"><b>${t.role === 'out' ? 'You' : escapeHtml(m.from)}:</b> ${escapeHtml(t.text)}</div>`).join('')}</div>`
      : '';
    return `<div class="msg ${m.status === 'new' ? 'new' : ''}" data-id="${m.id}">
      <div class="msg-head">
        <span>${escapeHtml(m.from)} <span class="plat">· ${escapeHtml(m.platform)}</span></span>
        <span class="plat">${timeAgo(m.ts)}</span>
      </div>
      ${history}
      <div class="msg-text">${escapeHtml(m.text)}</div>
      ${m.status === 'replied' && m.reply ? `<div class="msg-reply"><b>Agent:</b> ${escapeHtml(m.reply)}</div>` : ''}
      ${m.status === 'new' ? `<div class="row"><input placeholder="Write a reply…" /><button class="btn mini reply-btn">Send</button>
        <button class="btn mini ai-reply-btn" title="Let AI write it human-friendly">✨ AI</button></div>` : ''}
    </div>`;
  }).join('');
}

/* ---------------- Render: brain ---------------- */
function renderThinking(d) {
  const box = $('thinkingBox');
  $('cycleCount').textContent = 'cycle ' + (d.agent?.cycles ?? 0);
  if (!d.agent?.lastThinking) {
    box.className = 'thinking-box';
    box.innerHTML = '<p class="muted">The agent is idle. Press "Run brain now" to start a deep-reasoning cycle.</p>';
    return;
  }
  const t = d.agent.lastThinking;
  box.className = 'thinking-box done';
  const actions = (t.actions || []).map((a) => `<li>${escapeHtml((a.type || '').toUpperCase())} → <b>${escapeHtml(a.platform || '')}</b> · ${escapeHtml(a.topic || a.reason || '')}</li>`).join('');
  const fb = t.fallback ? '<div style="color:#e2a03f;font-weight:600;margin-top:6px">⚠ fallback intelligence active (AI budget low)</div>' : '';
  box.innerHTML = `<div style="font-weight:600;margin-bottom:6px">Deep reasoning:</div>${escapeHtml(t.thinking)}${fb}${actions ? `<ul style="margin:10px 0 0;padding-left:18px">${actions}</ul>` : ''}`;
}

/* ---------------- Render: growth ---------------- */
function renderGrowth(d) {
  const scores = d.growth || [];
  const el = $('growthScores');
  el.innerHTML = scores.length
    ? scores.map((s) => {
        const w = Math.min(100, Math.max(4, Math.round(s.score)));
        return `<div class="g-score">
          <span class="g-name">${escapeHtml(s.name)}</span>
          <span class="g-bar"><div style="width:${w}%"></div></span>
          <span class="g-val">${fmt(s.followers)} followers · score ${s.score.toFixed(1)}</span>
        </div>`;
      }).join('')
    : '<div class="muted">Analyzing platform growth… run a few cycles first.</div>';

  const pb = d.playbook || [];
  $('playbook').innerHTML = pb.length
    ? pb.map((p) => `<div class="pb-item">${escapeHtml(p.text)}<div class="pb-meta">${escapeHtml(p.platform)} · +${p.gain} followers</div></div>`).join('')
    : '<div class="muted">The agent will remember what content wins followers here.</div>';
}

/* ---------------- Render: analytics ---------------- */
function renderAnalytics(d) {
  const a = d.analysis;
  if (!a) return;
  const ov = $('anOverview');
  ov.innerHTML = `
    <div class="an-ov-grid">
      <div class="an-ov-cell"><span>Current</span><b>${fmt(a.current)}</b></div>
      <div class="an-ov-cell"><span>Target</span><b>${fmt(a.target)}</b></div>
      <div class="an-ov-cell"><span>Velocity</span><b>+${fmt(a.velocityPerDay)}/day</b></div>
      <div class="an-ov-cell"><span>ETA to 1M</span><b>${a.etaDays !== null ? a.etaDays + ' days' : '—'}</b></div>
    </div>
    <div class="an-bar"><div style="width:${Math.max(0.2, (a.current / a.target) * 100)}%"></div></div>
    <div class="an-ov-meta">
      <span>Compounding: <b>${a.compounding}</b> platform(s)</span>
      <span>Stalled: <b>${a.stalled}</b></span>
      <span>Avg engagement: <b>${a.engagementAvg}%</b></span>
    </div>`;

  const tbl = $('anPlatforms');
  tbl.innerHTML = `<div class="an-row an-head"><span>Platform</span><span>Followers</span><span>Growth/day</span><span>Eng%</span><span>Posts/day</span><span>Avg virality</span><span>ETA</span></div>` +
    a.platforms.map((p) => `
      <div class="an-row">
        <span class="an-pname">${escapeHtml(p.name)}</span>
        <span>${fmt(p.followers)}</span>
        <span class="${p.growthPerDay > 0 ? 'pos' : 'neg'}">${p.growthPerDay > 0 ? '+' : ''}${fmt(p.growthPerDay)}</span>
        <span>${p.engagement}%</span>
        <span>${p.postsToday}</span>
        <span class="${p.avgVirality !== null && p.avgVirality >= 38 ? 'pos' : ''}">${p.avgVirality !== null ? p.avgVirality + '/100' : '—'}${p.bestVirality ? ` <span class="muted">best ${p.bestVirality}</span>` : ''}</span>
        <span>${p.etaDays !== null ? p.etaDays + 'd' : '—'}</span>
      </div>`).join('') || '<div class="muted">Run cycles to populate analytics.</div>';

  // Algorithm conformance readout: how well recent posts match each platform's rulebook.
  const rules = d.algo?.rules || {};
  const posts = d.posts || [];
  const conformance = Object.keys(rules).map((name) => {
    const r = rules[name];
    const mine = posts.filter((p) => p.platform === name && typeof p.virality === 'number').slice(0, 10);
    const sc = mine.length ? Math.round(mine.reduce((a, p) => a + p.virality, 0) / mine.length) : 0;
    const tagCount = mine.some((p) => (p.hashtags || []).length) ? mine.map((p) => (p.hashtags || []).length).reduce((a, b) => a + b, 0) / mine.length : 0;
    return { name: r.name, score: sc, tagCount, n: mine.length, hashtags: r.hashtags };
  });
  $('anAlgo').innerHTML = conformance.map((c) => `
    <div class="an-algo-row">
      <span class="an-pname">${escapeHtml(c.name)}</span>
      ${c.n ? `
        <span class="an-algo-bar"><div style="width:${Math.max(2, c.score)}%"></div></span>
        <span class="${c.score >= 38 ? 'pos' : ''}">${c.score}/100</span>
        <span class="muted">${c.n} scored post(s) · tags ${Math.round(c.tagCount)}/${c.hashtags}</span>`
      : '<span class="muted">no scored posts yet</span>'}
    </div>`).join('');
}

/* ---------------- Render: viral engine ---------------- */
function renderViral(d) {
  const m = d.momentum;
  const box = $('momentumBox');
  if (box) {
    box.innerHTML = m
      ? `<div class="mom-row">
          <div class="mom-num">${fmt(m.current)}</div>
          <div class="mom-label">of ${fmt(m.target)} followers</div>
          <div class="mom-bar"><div style="width:${Math.max(0.3, m.pct)}%"></div></div>
          <div class="mom-pct">${m.pct.toFixed(3)}% · ${fmt(m.remaining)} to go</div>
        </div>
        <div class="mom-grid">
          ${(m.perPlatform || []).map((p) => `<div class="mom-chip"><b>${escapeHtml(p.name)}</b><span>${fmt(p.followers)}</span><span class="freq">${p.freq}x/day</span></div>`).join('')}
        </div>`
      : '<div class="muted">Momentum tracker will project the path to 1M once cycles run.</div>';
  }

  const vs = $('viralStats');
  if (vs) vs.textContent = `${d.viral?.generated || 0} generated · ${d.viral?.rejected || 0} rejected · best ${d.viral?.bestScore || 0}`;

  const rules = d.algo?.rules || {};
  const rulesEl = $('algoRules');
  if (rulesEl) {
    rulesEl.innerHTML = Object.entries(rules).map(([name, r]) => `
      <div class="algo">
        <div class="algo-head"><b>${escapeHtml(r.name)}</b><span class="chip">${r.freq}x/day · ${escapeHtml(r.bestTimes.join('h, '))}h</span></div>
        <div class="algo-row"><span class="algo-k">Rewards</span><span>${escapeHtml(r.rewards.join(', '))}</span></div>
        <div class="algo-row"><span class="algo-k">Punishes</span><span>${escapeHtml(r.punishes.join(', '))}</span></div>
        <div class="algo-row"><span class="algo-k">Format</span><span>${escapeHtml(r.format)}</span></div>
      </div>`).join('') || '<div class="muted">Loading algorithm rulebook…</div>';
  }
}

/* ---------------- Render: activity ---------------- */
function renderActivity(d) {
  const items = d.activity || [];
  $('activity').innerHTML = items.length
    ? items.map((a) => `<div class="act-item ${a.level}">
        <span class="time">${timeAgo(a.ts)}</span>
        <span class="src">${escapeHtml(a.source || '')}</span>
        <span class="msg-text">${escapeHtml(a.message || '')}</span>
      </div>`).join('')
    : '<div class="muted">Nothing yet.</div>';
}

/* ---------------- Render: settings ---------------- */
function renderAiStatus(d) {
  const usage = d.aiUsage || {};
  const aiInfo = d.ai || {};
  const html = `
    <div><b>Active provider:</b> ${escapeHtml(usage.provider || 'n/a')}</div>
    <div><b>Gemini model:</b> ${escapeHtml(aiInfo.model || 'gemini-flash-latest')}</div>
    <div><b>Calls:</b> ${usage.calls || 0} &nbsp;·&nbsp; <b>Tokens:</b> ${usage.in || 0} in / ${usage.out || 0} out</div>
    <div><b>Fallbacks:</b> ${usage.fallbacks || 0} (heuristic/growth-engine when API budget is low)</div>
    <div class="muted" style="font-size:12px">Replies are passed through the <b>Extreme Humanizer</b>: intent analysis → natural draft → human audit → AI-tell removal → casual flavor.</div>`;
  $('aiStatusBox').innerHTML = html;
}

/* ---------------- Master render ---------------- */
function renderAll(d) {
  state.data = d;
  renderKPIs(d);
  renderPlatforms(d);
  renderPosts(d);
  renderConnectors(d);
  renderInbox(d);
  renderThinking(d);
  renderGrowth(d);
  renderAnalytics(d);
  renderViral(d);
  renderActivity(d);
  renderAiStatus(d);

  const st = d.agent?.status || 'idle';
  const pill = $('agentStatus');
  pill.textContent = st;
  pill.className = 'status-pill ' + st;
  $('toggleBtn').textContent = d.running ? 'Pause agent' : 'Start agent';
  $('toggleBtn').classList.toggle('primary', !d.running);
  $('cycleBtn').disabled = !!d.running;

  const dot = $('aiDot');
  dot.className = 'ai-dot ' + ((d.aiUsage && d.aiUsage.fallbacks > 0 && !(d.aiUsage.calls > d.aiUsage.fallbacks)) ? 'err' : 'on');
  $('aiLabel').textContent = 'AI: ' + ((d.aiUsage && d.aiUsage.provider) || 'fallback') + (d.aiUsage && d.aiUsage.calls ? ' · ' + d.aiUsage.calls + ' calls' : '');

  const platSel = $('postPlatform');
  const current = platSel.value;
  const keys = Object.keys(d.platforms || {});
  if (keys.length) {
    platSel.innerHTML = keys.map((n) => `<option value="${n}">${n}</option>`).join('');
    if (current && keys.includes(current)) platSel.value = current;
  }
}

async function refresh(silent) {
  try { renderAll(await fetchJson('/api/state')); }
  catch (e) { if (!silent) toast('State refresh failed: ' + e.message, true); }
}

async function postAction(url, body, msgOk) {
  const r = await fetchJson(url, { method: 'POST', body: JSON.stringify(body || {}) });
  if (msgOk) toast(msgOk, false);
  refresh();
  return r;
}

/* ---------------- Events ---------------- */
function setup() {
  $('toggleBtn').addEventListener('click', async () => {
    try { await postAction('/api/agent/toggle', {}, 'Agent toggled.'); } catch (e) { toast(e.message, true); }
  });
  $('cycleBtn').addEventListener('click', async () => {
    $('cycleBtn').disabled = true;
    try { await postAction('/api/agent/cycle', { manual: true }, 'Brain cycle kicked off.'); } catch (e) { toast(e.message, true); }
  });
  $('postBtn').addEventListener('click', async () => {
    if (!$('postText').value.trim()) toast('Write something or run the brain to auto-generate.', true);
    $('postBtn').disabled = true;
    try {
      await postAction('/api/post', { platform: $('postPlatform').value, text: $('postText').value, topic: $('postTopic').value }, 'Posted!');
      $('postText').value = '';
    } catch (e) { toast(e.message, true); }
    $('postBtn').disabled = false;
  });
  $('postAllBtn').addEventListener('click', async () => {
    if (!$('postText').value.trim()) { toast('Write something to post everywhere.', true); return; }
    $('postAllBtn').disabled = true;
    try {
      await postAction('/api/post-all', { text: $('postText').value, topic: $('postTopic').value }, 'Posted to all platforms!');
      $('postText').value = '';
    } catch (e) { toast(e.message, true); }
    $('postAllBtn').disabled = false;
  });

  $('saveSettings').addEventListener('click', async () => {
    $('saveSettings').disabled = true;
    try {
      await postAction('/api/settings', {
        niche: $('setNiche').value, tone: $('setTone').value,
        target: Number($('setTarget').value) || undefined,
        autoPost: $('setAutoPost').checked, autoReply: $('setAutoReply').checked,
      }, 'Settings saved.');
    } catch (e) { toast(e.message, true); }
    $('saveSettings').disabled = false;
  });

  // Connectors
  $('connectors').addEventListener('click', async (ev) => {
    const save = ev.target.closest('.conn-save');
    const test = ev.target.closest('.conn-test');
    const connect = ev.target.closest('.conn-connect');
    const cancel = ev.target.closest('.conn-cancel');
    const connEl = ev.target.closest('.connector');
    if (!connEl) return;

    // ChatGPT-style: one click opens the connect panel.
    if (connect) {
      const panel = connEl.querySelector('.conn-panel');
      if (panel) panel.hidden = false;
      return;
    }
    if (cancel) {
      const panel = connEl.querySelector('.conn-panel');
      if (panel) panel.hidden = true;
      return;
    }

    const name = save ? save.dataset.name : test ? test.dataset.name : null;
    if (!name) return;

    if (test) {
      test.disabled = true;
      try {
        const r = await fetchJson('/api/connectors/test/' + name, { method: 'POST' });
        toast(`${name}: ${r.ok ? r.mode + ' responding' : 'test failed: ' + (r.error || 'check credentials')}`, !r.ok);
      } catch (e) { toast(e.message, true); }
      test.disabled = false;
      return;
    }

    if (save) {
      const fields = connEl.querySelectorAll('.conn-panel input');
      let saved = 0;
      save.disabled = true;
      try {
        for (const inp of fields) {
          if (inp.value && inp.value !== '••••••••') {
            await fetchJson('/api/connectors/credential', { method: 'POST', body: JSON.stringify({ key: inp.dataset.key, value: inp.value }) });
            saved++;
          }
        }
        if (saved) toast(`${name}: ${saved} credential(s) saved. Restart the agent to go live.`);
        else toast('No new credentials entered.', true);
        refresh();
      } catch (e) { toast(e.message, true); }
      save.disabled = false;
    }
  });

  // Inbox
  $('inboxBox').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const row = btn.closest('.msg');
    if (!row) return;
    const input = row.querySelector('input');
    const id = row.dataset.id;

    if (btn.classList.contains('ai-reply-btn')) {
      // Ask the agent to draft a humanized reply via the bench endpoint
      const msg = row.querySelector('.msg-text').textContent.trim();
      const platform = row.querySelector('.plat').textContent.replace('· ', '').trim();
      input.value = '✨ thinking…';
      try {
        const r = await fetchJson('/api/humanize', { method: 'POST', body: JSON.stringify({ text: msg, platform }) });
        input.value = r.reply || ''; input.placeholder = 'AI drafted a humanized reply — edit if you like, then send.';
      } catch (e) { toast(e.message, true); input.value = ''; }
      return;
    }

    if (btn.classList.contains('reply-btn') && input.value.trim()) {
      btn.disabled = true;
      try { await postAction('/api/reply/' + id, { text: input.value }, 'Reply sent.'); }
      catch (e) { toast(e.message, true); }
      btn.disabled = false;
    }
  });

  // Humanizer bench
  $('humBtn').addEventListener('click', async () => {
    const text = $('humInput').value.trim();
    if (!text) { toast('Type a message to humanize first.', true); return; }
    $('humBtn').disabled = true;
    $('humOut').className = 'hum-out muted';
    $('humOut').textContent = 'Humanizing…';
    try {
      const r = await fetchJson('/api/humanize', { method: 'POST', body: JSON.stringify({ text, platform: $('humPlatform').value, tone: 'casual' }) });
      $('humOut').className = 'hum-out';
      $('humOut').textContent = (r.reply || r.error || 'no reply') + (r.source ? `\n\n[source: ${r.source}]` : '');
    } catch (e) {
      $('humOut').className = 'hum-out';
      $('humOut').textContent = 'Error: ' + e.message;
    }
    $('humBtn').disabled = false;
  });

  // Viral content lab
  $('virGenBtn').addEventListener('click', async () => {
    $('virGenBtn').disabled = true;
    $('virOut').className = 'hum-out muted';
    $('virOut').textContent = 'Generating an algorithm-conformant viral post…';
    try {
      const r = await fetchJson('/api/viral/generate', { method: 'POST', body: JSON.stringify({ platform: $('virPlatform').value, topic: $('virTopic').value, tone: $('setTone').value }) });
      if (!r.ok) throw new Error(r.error || 'generation failed');
      const p = r.post || {};
      $('virOut').className = 'hum-out';
      $('virOut').innerHTML = `<b style="color:${r.virality >= 45 ? '#4ade80' : '#f0bf4b'}">Virality ${r.virality}/100</b> — <span class="muted">${escapeHtml((r.algo && r.algo.hook) || '')}</span>
        <pre>${escapeHtml(p.text)}</pre>
        ${p.hashtags ? `<div class="muted">${escapeHtml(p.hashtags.join(' '))}</div>` : ''}
        ${p.cta ? `<div class="cta-line">CTA: ${escapeHtml(p.cta)}</div>` : ''}`;
    } catch (e) {
      $('virOut').className = 'hum-out';
      $('virOut').textContent = 'Error: ' + e.message;
    }
    $('virGenBtn').disabled = false;
  });

  let evt;
  try {
    evt = new EventSource('/api/events');
    evt.addEventListener('activity', () => refresh(true));
  } catch (e) {}
  setInterval(() => refresh(true), 8000);
}

/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  setup();
  switchView('dashboard');
  await refresh();
  const d = state.data;
  if (d) {
    $('setNiche').value = d.settings?.niche || '';
    $('setTone').value = d.settings?.tone || 'casual';
    $('setTarget').value = d.goals?.[0]?.target || 10000;
    $('setAutoPost').checked = d.settings?.autoPost !== false;
    $('setAutoReply').checked = d.settings?.autoReply !== false;
  }
});