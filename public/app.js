const $ = (id) => document.getElementById(id);
const state = { data: null, timers: [] };

async function fetchJson(url, opts) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fmt(n) {
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

function renderKPIs(d) {
  const total = d.totals;
  const postsDelta = { up: total.posts > 0 };
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><div class="num">${fmt(total.followers)}</div><div class="label">Followers</div><div class="delta up">growing</div></div>
    <div class="kpi"><div class="num">${total.posts}</div><div class="label">Posts</div><div class="delta ${total.posts ? 'up' : 'flat'}">${total.posts ? 'live content' : 'no posts yet'}</div></div>
    <div class="kpi"><div class="num">${total.replies}</div><div class="label">Replies sent</div><div class="delta flat">auto + manual</div></div>
    <div class="kpi"><div class="num">${d.platforms ? Object.keys(d.platforms).length : 0}</div><div class="label">Platforms</div><div class="delta flat">mcp · rest · sim</div></div>
    <div class="kpi"><div class="num">${(d.aiUsage && d.aiUsage.calls) || 0}</div><div class="label">AI calls</div><div class="delta flat">${(d.aiUsage && d.aiUsage.in) || 0} tokens in · ${(d.aiUsage && d.aiUsage.out) || 0} out</div></div>`;
}

function renderThinking(d) {
  const box = $('thinkingBox');
  box.className = 'thinking-box';
  $('cycleCount').textContent = 'cycle ' + (d.agent?.cycles ?? 0);
  if (!d.agent?.lastThinking) {
    box.innerHTML = '<p class="muted">The agent is idle. Press "Run brain now" to start a deep-reasoning cycle.</p>';
    return;
  }
  const t = d.agent.lastThinking;
  const actions = (t.actions || [])
    .map((a) => `<li>${a.type.toUpperCase()} → <b>${a.platform}</b> · ${escapeHtml(a.topic || '')}<div class="reason">${escapeHtml(a.reason || '')}</div></li>`)
    .join('');
  box.classList.add('done');
  box.innerHTML = `<div style="font-weight:600;margin-bottom:6px">Deep reasoning:</div>${escapeHtml(t.thinking)}${actions ? `<ul style="margin:10px 0 0;padding-left:18px">${actions}</ul>` : ''}`;
}

function renderPlatforms(d) {
  const el = $('platforms');
  if (!d.platforms || !Object.keys(d.platforms).length) {
    el.innerHTML = '<div class="empty">Connecting platforms…</div>';
    return;
  }
  el.innerHTML = Object.entries(d.platforms).map(([name, p]) => {
    const meta = (d.platformMeta && d.platformMeta[name]) || {};
    return `<div class="platform">
      <div class="name"><span class="dot ${p.connected ? '' : 'off'}"></span>${escapeHtml(meta.label || name)}</div>
      <div class="handle">${escapeHtml(meta.handle || p.handle || '')}</div>
      <div class="stats"><span>Followers</span><b>${fmt(p.followers || 0)}</b></div>
      <div class="stats"><span>Posts</span><b>${p.posts || 0}</b></div>
      <div class="stats"><span>Engagement</span><b>${(p.engagement || 0).toFixed(1)}%</b></div>
      <span class="mode mode-${p.mode || 'sim'}">${p.mode || 'sim'}</span>
    </div>`;
  }).join('');
}

function renderGoals(d) {
  const goals = d.goals || [];
  if (!goals.length) { $('goalsBox').innerHTML = '<div class="empty">No goals yet.</div>'; return; }
  $('goalsBox').innerHTML = goals.map((g) => {
    const pct = Math.min(100, Math.round(((g.progress ?? 0) / (g.target ? 100 : 1))));
    const shown = g.target ? Math.round(g.progress ?? 0) : 0;
    const steps = (g.steps || []).map((s) => `<li class="${s.done ? 'done' : ''}">${escapeHtml(s.title)}</li>`).join('');
    return `<div class="goal">
      <div class="g-head"><div class="g-title">${escapeHtml(g.title)}</div><div class="g-progress">${shown}% · ${g.status}</div></div>
      <div class="progress"><div style="width:${Math.min(100, shown)}%"></div></div>
      <ul class="g-steps">${steps}</ul>
    </div>`;
  }).join('');
}

function renderInbox(d) {
  const items = d.inbox || [];
  $('inboxCount').textContent = items.filter((m) => m.status === 'new').length + ' new';
  if (!items.length) { $('inboxBox').innerHTML = '<div class="empty">No messages yet — they arrive while the agent runs.</div>'; return; }
  $('inboxBox').innerHTML = items.slice(0, 15).map((m) => `
    <div class="msg ${m.status === 'new' ? 'new' : ''}" data-id="${m.id}">
      <div class="msg-head"><span>${escapeHtml(m.from)} <span class="plat">· ${escapeHtml(m.platform)}</span></span><span class="plat">${timeAgo(m.ts)}</span></div>
      <div class="msg-text">${escapeHtml(m.text)}</div>
      ${m.reply ? `<div class="msg-reply"><b>Agent:</b> ${escapeHtml(m.reply)}</div>` : ''}
      ${m.status === 'new' ? `<div class="row"><input placeholder="Write a reply…" /><button class="btn mini reply-btn">Send</button></div>` : ''}
    </div>`).join('');
}

function renderActivity(d) {
  const items = d.activity || [];
  $('activity').innerHTML = items.length ? items.map((a) => `
    <div class="act-item ${a.level}">
      <span class="time">${timeAgo(a.ts)}</span>
      <span class="src">${escapeHtml(a.source || '')}</span>
      <span class="msg-text">${escapeHtml(a.message || '')}</span>
    </div>`).join('') : '<div class="empty">Nothing yet.</div>';
}

function renderAll(d) {
  state.data = d;
  renderKPIs(d);
  renderThinking(d);
  renderPlatforms(d);
  renderGoals(d);
  renderInbox(d);
  renderActivity(d);
  const st = d.agent?.status ?? 'idle';
  const pill = $('agentStatus');
  pill.textContent = st;
  pill.className = 'status-pill ' + st;
  $('toggleBtn').textContent = d.running ? 'Pause agent' : 'Start agent';
  const platSel = $('postPlatform');
  if (platSel.options.length === 0 && d.platforms) {
    platSel.innerHTML = Object.keys(d.platforms).map((n) => `<option>${n}</option>`).join('');
  }
}

async function refresh() {
  try { renderAll(await fetchJson('/api/state')); } catch (e) { console.error(e); }
}

function setup() {
  $('cycleBtn').addEventListener('click', async () => {
    $('cycleBtn').disabled = true;
    await fetchJson('/api/agent/cycle', { method: 'POST', body: JSON.stringify({ manual: true }) });
    $('cycleBtn').disabled = false;
    refresh();
  });

  $('toggleBtn').addEventListener('click', async () => {
    await fetchJson('/api/agent/toggle', { method: 'POST' });
    refresh();
  });

  $('postBtn').addEventListener('click', async () => {
    await fetchJson('/api/post', {
      method: 'POST',
      body: JSON.stringify({ platform: $('postPlatform').value, text: $('postText').value, topic: $('postTopic').value }),
    });
    $('postText').value = '';
    refresh();
  });

  $('postAllBtn').addEventListener('click', async () => {
    await fetchJson('/api/post-all', {
      method: 'POST',
      body: JSON.stringify({ text: $('postText').value, topic: $('postTopic').value }),
    });
    $('postText').value = '';
    refresh();
  });

  $('saveSettings').addEventListener('click', async () => {
    await fetchJson('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        niche: $('setNiche').value,
        tone: $('setTone').value,
        target: Number($('setTarget').value) || undefined,
        autoPost: $('setAutoPost').checked,
        autoReply: $('setAutoReply').checked,
      }),
    });
    refresh();
  });

  $('inboxBox').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.reply-btn');
    if (!btn) return;
    const row = btn.closest('.msg');
    const input = row.querySelector('input');
    if (!input.value.trim()) return;
    await fetchJson('/api/reply/' + row.dataset.id, { method: 'POST', body: JSON.stringify({ text: input.value }) });
    refresh();
  });

  let evt;
  try {
    evt = new EventSource('/api/events');
    evt.addEventListener('activity', () => refresh());
  } catch (e) {}
  setInterval(refresh, 10000);
}

// prefill settings from state on first load
document.addEventListener('DOMContentLoaded', async () => {
  setup();
  await refresh();
  const d = state.data;
  if (d) {
    $('setNiche').value = d.settings?.niche || '';
    $('setTone').value = d.settings?.tone || 'professional';
    $('setTarget').value = d.goals?.[0]?.target || 10000;
    $('setAutoPost').checked = d.settings?.autoPost !== false;
    $('setAutoReply').checked = d.settings?.autoReply !== false;
  }
});