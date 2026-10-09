/* CRM de Prospecção — JC Automações (frontend, sem build) */
'use strict';

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
const pct = (v, d = 0) => (v == null ? '—' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%');
const n = v => (v || 0).toLocaleString('pt-BR');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } },
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function fmtDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined });
  return withTime ? `${date} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : date;
}
const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
function rel(iso) {
  if (!iso) return '';
  const s = (new Date(iso) - Date.now()) / 1000, a = Math.abs(s);
  if (a < 60) return 'agora';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return rtf.format(Math.round(s / (86400 * 30)), 'month');
}
const toLocalInput = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };
const fromLocalInput = v => (v ? new Date(v).toISOString() : null);

async function api(path, opts = {}) {
  const init = { headers: {}, ...opts };
  if (opts.body && !(opts.body instanceof FormData)) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const r = await fetch(path, init);
  if (r.status === 401 && path !== '/api/login') { showLogin(); throw new Error('Faça login'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erro ' + r.status);
  return data;
}

async function copy(text, msg = 'Copiado!') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    document.execCommand('copy'); t.remove();
  }
  toast(msg);
}

// ---------- ícones ----------
const I = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  leads: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6"/>',
  tasks: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  wa: '<path d="M20.5 3.5A11 11 0 0 0 3.4 17.1L2 22l5-1.3A11 11 0 0 0 20.5 3.5zM12 20a8.9 8.9 0 0 1-4.6-1.3l-.3-.2-3 .8.8-2.9-.2-.3A9 9 0 1 1 12 20zm4.9-6.7c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1.1-.3.2-.6.1a7.3 7.3 0 0 1-3.6-3.2c-.3-.5.3-.4.8-1.4.1-.2 0-.3 0-.5l-.8-2c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.3-.2-.6-.3z" fill="currentColor" stroke="none"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  flag: '<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  bolt: '<path d="M13 2L3 14h8l-1 8 10-12h-8z"/>',
  money: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  users: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 16 0v1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const ic = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;

// ---------- estado ----------
let META = null;
const ST_LABEL = { 'Forte Lead': 'Prévia enviada' };
const stLabel = s => ST_LABEL[s] || s;
const CANAL = { whatsapp: 'WhatsApp', ligacao: 'Ligação' };
const REDE = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', linktree: 'Linktree', wa_disguised: 'WhatsApp', outro: 'Site/rede' };

async function loadMeta() { META = await api('/api/meta'); return META; }

// ---------- toast / modal / tooltip ----------
function toast(msg, { err = false, actions = [], ms = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.innerHTML = `<div>${msg}</div>` + (actions.length ? `<div class="acts">${actions.map((a, i) => `<button class="btn sm ${a.cls || ''}" data-i="${i}">${a.label}</button>`).join('')}<button class="btn sm ghost" data-close>Fechar</button></div>` : '');
  $('#toasts').appendChild(el);
  const close = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.i != null) actions[b.dataset.i].onClick();
    close();
  });
  setTimeout(close, actions.length ? 12000 : ms);
}
const toastErr = e => toast(esc(e.message || e), { err: true, ms: 5000 });

function modal(html, onMount) {
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(bg);
    const done = v => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('mousedown', e => { if (e.target === bg) done(null); });
    $$('[data-cancel]', bg).forEach(b => b.addEventListener('click', () => done(null)));
    onMount?.(bg.firstElementChild, done);
    setTimeout(() => $('input, textarea, .opt, button', bg)?.focus(), 30);
  });
}

const tip = () => $('#tip');
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-tip]');
  if (!t) { tip().classList.remove('on'); return; }
  tip().textContent = t.dataset.tip; tip().classList.add('on');
});
document.addEventListener('mousemove', e => {
  if (!tip().classList.contains('on')) return;
  const w = tip().offsetWidth, h = tip().offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  tip().style.left = x + 'px'; tip().style.top = y + 'px';
});

// ---------- fluxo de troca de status (com perguntas rápidas) ----------
async function askStatus(lead, novo) {
  const body = { status: novo };
  if (novo === 'Contatado' && lead.status === 'Novo') {
    const canal = await modal(`
      <h3>Como foi o contato?</h3><p>${esc(lead.nome)} — registro a tentativa com o canal usado.</p>
      <div class="opts">
        <button class="opt" data-v="whatsapp"><b>${ic('wa')} WhatsApp</b><span class="muted small">mensagem enviada</span></button>
        <button class="opt" data-v="ligacao"><b>${ic('phone')} Ligação</b><span class="muted small">liguei</span></button>
      </div>
      <div class="foot"><button class="btn ghost" data-cancel>Cancelar</button></div>`,
    (m, done) => {
      $$('.opt', m).forEach(o => o.addEventListener('click', () => done(o.dataset.v)));
      $(`.opt[data-v="${lead.canal_preferido || 'whatsapp'}"]`, m)?.classList.add('on');
    });
    if (!canal) return null;
    body.canal = canal;
  }
  if (novo === 'Perdido') {
    const r = await modal(`
      <h3>Motivo da perda</h3><p>${esc(lead.nome)}</p>
      <div class="opts">${META.motivosPerda.map(m => `<button class="opt" data-v="${esc(m)}"><b>${esc(m)}</b></button>`).join('')}</div>
      <label class="f" style="margin-top:12px"><span>Detalhe (opcional)</span><input class="input" id="m-det" placeholder="ex: fechou com sobrinho"></label>
      <div class="foot"><button class="btn ghost" data-cancel>Cancelar</button></div>`,
    (m, done) => $$('.opt', m).forEach(o => o.addEventListener('click', () => done({ motivo_perda: o.dataset.v, detalhe: $('#m-det', m).value }))));
    if (!r) return null;
    Object.assign(body, r);
  }
  if (novo === 'Fechado' || novo === 'Negociando') {
    const fech = novo === 'Fechado';
    const r = await modal(`
      <h3>${fech ? 'Fechou! Qual plano?' : 'Qual plano está em negociação?'}</h3>
      <p>${fech ? 'Entra na receita ganha do dashboard.' : `Usado no valor de pipeline (sem plano, conta ${money(META.valorPadrao)}).`}</p>
      <div class="opts">${Object.entries(META.planos).map(([k, p]) => `<button class="opt${lead.plano === k ? ' on' : ''}" data-v="${k}"><b>${esc(p.label)}</b><span class="num">${money(p.valor)}</span></button>`).join('')}
      ${fech ? '' : '<button class="opt" data-v=""><b>Ainda não sei</b></button>'}</div>
      <label class="row" style="margin-top:12px;font-size:13px"><input type="checkbox" id="m-man" ${lead.manutencao ? 'checked' : ''}> Contratou/quer manutenção mensal (+${money(META.manutencao)}/mês)</label>
      <div class="foot"><button class="btn ghost" data-cancel>Cancelar</button></div>`,
    (m, done) => $$('.opt', m).forEach(o => o.addEventListener('click', () => done({ plano: o.dataset.v, manutencao: $('#m-man', m).checked }))));
    if (!r) return null;
    Object.assign(body, r);
  }
  const updated = await api(`/api/leads/${lead.id}/status`, { method: 'POST', body });
  toast(`<b>${esc(lead.nome)}</b> → ${esc(stLabel(updated.status))}`);
  return updated;
}

function statusSelect(lead, attrs = '') {
  return `<select class="status-sel st" data-s="${esc(lead.status)}" ${attrs} aria-label="Status">${META.statuses.map(s =>
    `<option value="${esc(s)}" ${s === lead.status ? 'selected' : ''}>${esc(stLabel(s))}</option>`).join('')}</select>`;
}

// Depois de abrir WhatsApp/ligar, oferece registrar a tentativa em 1 clique.
function offerLog(lead, canal, after) {
  const opts = META.resultados[canal].slice(0, canal === 'whatsapp' ? 2 : 3);
  toast(`Registrar tentativa por <b>${CANAL[canal]}</b> com ${esc(lead.nome)}?`, {
    actions: opts.map((r, i) => ({
      label: r, cls: i === 0 ? (canal === 'whatsapp' ? 'wa' : 'call') : '',
      onClick: async () => {
        try { const u = await api(`/api/leads/${lead.id}/contato`, { method: 'POST', body: { canal, resultado: r } }); toast('Tentativa registrada'); after?.(u); }
        catch (e) { toastErr(e); }
      },
    })),
  });
}

// ---------- shell / roteamento ----------
const ROUTES = [
  { hash: '#/dashboard', label: 'Dashboard', icon: 'dash' },
  { hash: '#/leads', label: 'Leads', icon: 'leads' },
  { hash: '#/tarefas', label: 'Tarefas', icon: 'tasks' },
  { hash: '#/importar', label: 'Importar', icon: 'upload' },
];
let ME = { passwordEnabled: false };

function shell() {
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand"><img src="/logo.jpg" alt=""><div><b>JC Automações</b><span>CRM de prospecção</span></div></div>
      <nav class="nav">${ROUTES.map(r => `<a href="${r.hash}" data-r="${r.hash}">${ic(r.icon, 18)}${r.label}<span class="badge-n hide" data-late></span></a>`).join('')}</nav>
      <div class="side-foot">
        <button class="btn sm ghost" id="theme" data-tip="Alternar tema claro/escuro">${ic('sun')} Tema</button>
        ${ME.passwordEnabled ? `<button class="btn sm ghost" id="logout">${ic('out')} Sair</button>` : ''}
      </div>
    </aside>
    <main class="main" id="view"></main>
    <nav class="bottomnav">${ROUTES.map(r => `<a href="${r.hash}" data-r="${r.hash}">${ic(r.icon, 20)}${r.label}</a>`).join('')}</nav>
  </div>`;
  $('#theme').onclick = () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = cur;
    try { localStorage.setItem('crm_theme', cur); } catch { /* ok */ }
  };
  $('#logout')?.addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); location.reload(); });
}

async function refreshLateBadge() {
  try {
    const tasks = await api('/api/tasks?scope=open');
    const late = tasks.filter(t => t.due_at && new Date(t.due_at) < new Date()).length;
    $$('.nav a[data-r="#/tarefas"] [data-late]').forEach(b => { b.textContent = late; b.classList.toggle('hide', !late); });
  } catch { /* ignore */ }
}

async function route() {
  if (!$('.shell')) return;
  const h = location.hash || '#/dashboard';
  $$('[data-r]').forEach(a => a.classList.toggle('on', h.startsWith(a.dataset.r) || (h.startsWith('#/lead/') && a.dataset.r === '#/leads')));
  const view = $('#view');
  view.innerHTML = '<div class="grid g4"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  window.scrollTo(0, 0);
  try {
    if (h.startsWith('#/lead/')) await renderLead(view, h.split('/')[2]);
    else if (h.startsWith('#/leads')) await renderLeads(view);
    else if (h.startsWith('#/tarefas')) await renderTasks(view);
    else if (h.startsWith('#/importar')) await renderImport(view);
    else await renderDashboard(view);
  } catch (e) { view.innerHTML = `<div class="card empty">Erro: ${esc(e.message)}</div>`; }
  refreshLateBadge();
}

// ============================================================
// DASHBOARD
// ============================================================
const dashF = store.get('crm_dashF', { nicho: '', cidade: '', canal: '', periodo: '' });

function optList(items, sel, all) {
  return `<option value="">${all}</option>` + items.map(i => `<option value="${esc(i.v)}" ${i.v === sel ? 'selected' : ''}>${esc(i.v)} (${n(i.n)})</option>`).join('');
}

function hbars(rows, { color, onClickKey, max } = {}) {
  if (!rows.length) return '<div class="empty">Sem dados</div>';
  const m = max || Math.max(...rows.map(r => r.n), 1);
  return `<div class="hbars">${rows.map(r => `
    <div class="hb" ${onClickKey ? `data-go="${onClickKey}" data-k="${esc(r.k)}"` : ''} data-tip="${esc(r.k)}: ${n(r.n)}${r.tip ? '\n' + r.tip : ''}">
      <span class="t">${esc(r.k)}</span><span class="b"><i style="width:${(r.n / m) * 100}%;${color ? `--c:${color}` : ''}"></i></span><span class="v">${r.label ?? n(r.n)}</span>
    </div>`).join('')}</div>`;
}

async function renderDashboard(view) {
  await loadMeta();
  const q = new URLSearchParams({ hoje: startOfToday().toISOString() });
  ['nicho', 'cidade', 'canal'].forEach(k => dashF[k] && q.set(k, dashF[k]));
  if (dashF.periodo) q.set('desde', new Date(Date.now() - Number(dashF.periodo) * 864e5).toISOString());
  const d = await api('/api/dashboard?' + q);

  const maxF = Math.max(d.funnel[0].count, 1);
  const fColors = ['--f1', '--f2', '--f3', '--f4', '--f5', '--f6', '--f7'];
  const funnelHtml = d.funnel.map((f, i) => {
    const w = Math.max((f.count / maxF) * 100, f.count ? 2 : 0.6);
    const step = f.nextPct != null ? `<div class="f-step"><div></div><div>↓ <em>${pct(f.nextPct)}</em> avançam pra próxima etapa</div><div></div></div>` : '';
    return `<div class="f-row">
      <div class="f-name">${esc(f.label)}<small>${f.agora ? `${n(f.agora)} parados aqui agora` : '&nbsp;'}</small></div>
      <div class="f-track"><div class="f-bar ${w < 14 ? 'out' : ''}" data-go-status="${esc(f.status)}" style="width:${w}%;background:var(${fColors[i]})${i < 3 && w >= 14 ? ';color:#0a1120' : ''}"
        data-tip="${esc(f.label)}\n${n(f.count)} leads chegaram até aqui (${pct(f.cumPct, 1)})\n${n(f.agora)} estão nessa etapa agora${f.perdidosAqui ? `\n${n(f.perdidosAqui)} perdidos depois daqui` : ''}\nClique pra ver os leads"><span>${n(f.count)}</span></div></div>
      <div class="f-stats"><b class="num">${pct(f.cumPct, f.cumPct < 0.1 && f.cumPct > 0 ? 1 : 0)}</b><span class="muted">do total</span></div>
    </div>${step}`;
  }).join('');

  const C = 2 * Math.PI * 62;
  const conv = d.conversao;
  const cw = d.canais.find(c => c.canal === 'whatsapp'), cl = d.canais.find(c => c.canal === 'ligacao');
  const rate = (a, b) => (b ? a / b : null);
  const canalMetric = (label, fn, fmt) => {
    const a = fn(cw), b = fn(cl), m = Math.max(a ?? 0, b ?? 0, 1e-9);
    return `<div class="canal-metric"><div class="lbl">${label}</div><div class="pair">
      <div class="hb" data-tip="WhatsApp: ${fmt(a)}"><span class="t">WhatsApp</span><span class="b"><i style="width:${((a ?? 0) / m) * 100}%;--c:var(--wa)"></i></span><span class="v">${fmt(a)}</span></div>
      <div class="hb" data-tip="Ligação: ${fmt(b)}"><span class="t">Ligação</span><span class="b"><i style="width:${((b ?? 0) / m) * 100}%;--c:var(--call)"></i></span><span class="v">${fmt(b)}</span></div>
    </div></div>`;
  };
  const tipoTotal = d.porTipo.reduce((s, t) => s + t.n, 0) || 1;
  const tipoColors = ['var(--f6)', 'var(--f7)', 'var(--warn)', 'var(--muted)'];
  const taskLi = (t, late) => `<div class="li ${late ? 'late' : ''}">
      <input type="checkbox" data-done="${t.id}" style="margin-top:8px;accent-color:var(--accent)" aria-label="Concluir">
      <div class="body"><b>${esc(t.titulo)}</b>${t.lead_nome ? `<div class="d"><a href="#/lead/${t.lead_id}">${esc(t.lead_nome)}</a></div>` : ''}</div>
      <span class="when">${late ? rel(t.due_at) : fmtDate(t.due_at).split(' ')[1]}</span></div>`;

  view.innerHTML = `
  <div class="fade-in">
    <div class="page-head">
      <div><h1>Dashboard</h1><p>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
    </div>
    <div class="filters">
      <select class="input" data-f="nicho">${optList(META.nichos, dashF.nicho, 'Todos os nichos')}</select>
      <select class="input" data-f="cidade">${optList(META.cidades, dashF.cidade, 'Todas as cidades')}</select>
      <select class="input" data-f="canal"><option value="">Todos os canais</option>${Object.entries(CANAL).map(([k, v]) => `<option value="${k}" ${dashF.canal === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="input" data-f="periodo"><option value="">Todo o período</option>${[[7, '7 dias'], [30, '30 dias'], [90, '90 dias']].map(([v, l]) => `<option value="${v}" ${String(dashF.periodo) === String(v) ? 'selected' : ''}>Importados nos últimos ${l}</option>`).join('')}</select>
      ${Object.values(dashF).some(Boolean) ? '<button class="btn ghost sm" id="clearF">Limpar filtros</button>' : ''}
    </div>

    <div class="grid g4">
      <div class="card kpi"><div class="lbl"><span class="ic">${ic('users')}</span>Total de leads</div><div class="val num">${n(d.total)}</div><div class="sub">${n(d.ativos)} ativos no funil</div></div>
      <div class="card kpi"><div class="lbl"><span class="ic">${ic('bolt')}</span>Mudados hoje</div><div class="val num">${n(d.mudadosHoje)}</div><div class="sub">${n(d.tentativasHoje)} tentativas de contato hoje</div></div>
      <div class="card kpi"><div class="lbl"><span class="ic">${ic('target')}</span>Valor de pipeline</div><div class="val num">${money(d.pipeline)}</div><div class="sub">${n(d.negociando)} negociando · ${money(d.pipelineAberto)} em aberto${d.negociandoSemPlano ? ` <span data-tip="${d.negociandoSemPlano} lead(s) negociando sem plano definido — contando ${money(META.valorPadrao)} cada">(estim.)</span>` : ''}</div></div>
      <div class="card kpi"><div class="lbl"><span class="ic">${ic('money')}</span>Receita ganha</div><div class="val num">${money(d.receita)}</div><div class="sub">${n(d.fechados)} fechados${d.mrr ? ` · +${money(d.mrr)}/mês manutenção` : ''}</div></div>
    </div>

    <div class="grid g21" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Funil de vendas</h2><span class="muted small">% acumulado desde a entrada · clique numa barra pra ver os leads</span></div>
        ${d.total ? `<div class="funnel">${funnelHtml}</div>` : '<div class="empty">Nenhum lead ainda — <a href="#/importar">importe uma planilha</a>.</div>'}
      </div>
      <div class="grid" style="align-content:start">
        <div class="card">
          <div class="card-head"><h2>Taxa de conversão</h2><span class="muted small">leads → fechado</span></div>
          <div class="donut-wrap">
            <div class="donut" data-tip="${n(d.fechados)} fechados de ${n(d.total)} leads">
              <svg viewBox="0 0 150 150" width="150" height="150"><circle cx="75" cy="75" r="62" fill="none" stroke="var(--track)" stroke-width="14"/>
              <circle cx="75" cy="75" r="62" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" transform="rotate(-90 75 75)"
                stroke-dasharray="${Math.max(conv * C, conv > 0 ? 4 : 0)} ${C}"/></svg>
              <div class="center"><div><b class="num">${pct(conv, 1)}</b><span>conversão geral</span></div></div>
            </div>
            <div class="statlist">
              <div><span>Taxa de resposta</span><b>${pct(d.taxaResposta, 1)}</b></div>
              <div><span>Em negociação</span><b>${n(d.negociando)}</b></div>
              <div><span>Fechados</span><b style="color:var(--good)">${n(d.fechados)}</b></div>
              <div><span>Perdidos</span><b style="color:var(--bad)">${n(d.perdidos)}</b></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Tarefas</h2><a class="btn sm ghost" href="#/tarefas">Ver todas</a></div>
          ${d.tarefasAtrasadas.length || d.tarefasHoje.length ? `<div class="list">
            ${d.tarefasAtrasadas.length ? `<div class="small" style="color:var(--bad);font-weight:600;padding:0 8px">Atrasadas (${d.tarefasAtrasadas.length})</div>${d.tarefasAtrasadas.slice(0, 6).map(t => taskLi(t, true)).join('')}` : ''}
            ${d.tarefasHoje.length ? `<div class="small muted" style="font-weight:600;padding:6px 8px 0">Hoje (${d.tarefasHoje.length})</div>${d.tarefasHoje.slice(0, 6).map(t => taskLi(t, false)).join('')}` : ''}
          </div>` : '<div class="empty">Nada pra hoje. Crie lembretes de follow-up no detalhe de cada lead.</div>'}
        </div>
      </div>
    </div>

    <div class="grid g3" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Conversão por canal</h2><div class="legend"><span><i style="background:var(--wa)"></i>WhatsApp</span><span><i style="background:var(--call)"></i>Ligação</span></div></div>
        ${cw.contatados || cl.contatados ? `<div class="canal-cmp">
          ${canalMetric('Leads contatados', c => c.contatados, v => n(v))}
          ${canalMetric('Taxa de resposta', c => rate(c.responderam, c.contatados), v => pct(v))}
          ${canalMetric('Chegaram a negociar', c => rate(c.negociando, c.contatados), v => pct(v))}
          ${canalMetric('Fecharam', c => rate(c.fechados, c.contatados), v => pct(v, 1))}
          <div class="muted small">${n(cw.tentativas)} tentativas por WhatsApp · ${n(cl.tentativas)} ligações. Canal = o do 1º contato.</div>
        </div>` : '<div class="empty">Ainda sem contatos registrados.</div>'}
      </div>
      <div class="card">
        <div class="card-head"><h2>Motivos de perda</h2><span class="muted small">${n(d.perdidos)} perdidos</span></div>
        ${hbars(d.motivosPerda.map(m => ({ ...m, label: `${n(m.n)}` })), { color: 'var(--bad)' })}
      </div>
      <div class="card">
        <div class="card-head"><h2>Atividade recente</h2></div>
        ${d.recentes.length ? `<div class="list">${d.recentes.map(e => `
          <a class="li" href="#/lead/${e.lead_id}" style="text-decoration:none">
            <span class="dot ${e.tipo === 'contato' ? e.canal : e.tipo}">${ic(e.tipo === 'contato' ? (e.canal === 'ligacao' ? 'phone' : 'wa') : e.tipo === 'nota' ? 'note' : 'flag', 14)}</span>
            <span class="body"><b>${esc(e.lead_nome)}</b><span class="d" style="display:block">${e.tipo === 'status' ? `${esc(stLabel(e.de))} → ${esc(stLabel(e.para))}` : e.tipo === 'contato' ? `${CANAL[e.canal]}${e.resultado ? ' — ' + esc(e.resultado) : ''}` : esc(e.detalhe)}</span></span>
            <span class="when">${rel(e.created_at)}</span></a>`).join('')}</div>` : '<div class="empty">Sem atividade ainda.</div>'}
      </div>
    </div>

    <div class="grid g3" style="margin-top:16px">
      <div class="card"><div class="card-head"><h2>Leads por nicho</h2><span class="muted small">clique pra filtrar</span></div>${hbars(d.porNicho.slice(0, 12), { onClickKey: 'nicho' })}</div>
      <div class="card"><div class="card-head"><h2>Leads por cidade</h2><span class="muted small">clique pra filtrar</span></div>${hbars(d.porCidade.slice(0, 12), { onClickKey: 'cidade' })}</div>
      <div class="card"><div class="card-head"><h2>Presença online</h2><span class="muted small">tipo de contato</span></div>
        ${d.porTipo.length ? `<div class="split" style="margin-bottom:12px">${d.porTipo.map((t, i) => `<i style="width:${(t.n / tipoTotal) * 100}%;background:${tipoColors[i] || 'var(--muted)'}" data-tip="${esc(t.k)}: ${n(t.n)} (${pct(t.n / tipoTotal)})"></i>`).join('')}</div>
        <div class="statlist">${d.porTipo.map((t, i) => `<div data-go="tipo" data-k="${esc(t.k)}" style="cursor:pointer"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:${tipoColors[i] || 'var(--muted)'}"></i>${esc(t.k)}</span><b>${n(t.n)} <span class="muted small">${pct(t.n / tipoTotal)}</span></b></div>`).join('')}</div>` : '<div class="empty">Sem dados</div>'}
      </div>
    </div>
  </div>`;

  $$('[data-f]', view).forEach(s => s.addEventListener('change', () => { dashF[s.dataset.f] = s.value; store.set('crm_dashF', dashF); renderDashboard(view); }));
  $('#clearF', view)?.addEventListener('click', () => { Object.keys(dashF).forEach(k => (dashF[k] = '')); store.set('crm_dashF', dashF); renderDashboard(view); });
  const goLeads = extra => {
    const f = { ...leadF, q: '', nicho: dashF.nicho, cidade: dashF.cidade, canal: dashF.canal, status: '', tipo: '', prioridade: '', ...extra };
    Object.assign(leadF, f); store.set('crm_leadF', leadF); location.hash = '#/leads';
  };
  $$('[data-go-status]', view).forEach(b => b.addEventListener('click', () => goLeads({ status: b.dataset.goStatus })));
  $$('[data-go]', view).forEach(b => b.addEventListener('click', () => goLeads({ [b.dataset.go]: b.dataset.k === '—' ? '' : b.dataset.k })));
  $$('[data-done]', view).forEach(c => c.addEventListener('change', async () => {
    try { await api(`/api/tasks/${c.dataset.done}`, { method: 'PATCH', body: { done: true } }); toast('Tarefa concluída'); renderDashboard(view); refreshLateBadge(); }
    catch (e) { toastErr(e); }
  }));
}

// ============================================================
// LISTA DE LEADS
// ============================================================
const leadF = store.get('crm_leadF', { q: '', nicho: '', cidade: '', tipo: '', prioridade: '', status: '', canal: '', sort: 'recentes' });
const leadCache = new Map();

const prioBadge = l => (l.prioridade && l.prioridade !== 'alta'
  ? `<span class="badge ${esc(l.prioridade)}">${l.prioridade === 'revisar' ? 'Revisar' : 'Baixa'}</span>` : '');
const sinceTip = l => (l.status_updated_at ? 'Status mudou em ' + fmtDate(l.status_updated_at) : 'Importado em ' + fmtDate(l.created_at));
const taskFlag = l => (l.tarefas_abertas
  ? `<span class="task-flag" data-tip="Próxima tarefa: ${esc(fmtDate(l.proxima_tarefa))}">${ic('clock', 12)} ${l.tarefas_abertas}</span>` : '');

// Ações sempre nas mesmas posições: o que não existe aparece apagado, pra alinhar tudo.
function leadIcons(l) {
  return `<div class="iconrow">
    <a class="ibtn wa" href="${esc(l.wa_link)}" target="_blank" rel="noopener" data-act="wa" data-tip="${l.mensagem ? 'Abrir WhatsApp com a mensagem' : 'Abrir WhatsApp (sem mensagem escrita)'}">${ic('wa', 16)}</a>
    <a class="ibtn call" href="tel:+${esc(l.tel_digits)}" data-act="call" data-tip="Ligar">${ic('phone', 15)}</a>
    <button class="ibtn" data-act="copy-msg" ${l.mensagem ? 'data-tip="Copiar mensagem"' : 'disabled data-tip="Sem mensagem — escreva no detalhe do lead"'}>${ic('msg', 15)}</button>
    ${l.rede_link ? `<a class="ibtn" href="${esc(l.rede_link)}" target="_blank" rel="noopener" data-tip="Ver ${REDE[l.rede_tipo] || 'perfil'}">${ic('link', 15)}</a>` : `<span class="ibtn off" data-tip="Sem rede social">${ic('link', 15)}</span>`}
    ${l.maps_link ? `<a class="ibtn" href="${esc(l.maps_link)}" target="_blank" rel="noopener" data-tip="Ver no Google Maps">${ic('pin', 15)}</a>` : `<span class="ibtn off">${ic('pin', 15)}</span>`}
  </div>`;
}

function leadRow(l) {
  return `<div class="lrow ${leadSel.has(l.id) ? 'sel' : ''}" data-id="${l.id}">
    <div class="c-chk"><input type="checkbox" data-sel="${l.id}" ${leadSel.has(l.id) ? 'checked' : ''} aria-label="Selecionar ${esc(l.nome)}"></div>
    <div class="c-name">
      <a class="name" href="#/lead/${l.id}">${esc(l.nome)}</a>
      <div class="sub">${l.estrelas ? `<span class="stars">★ ${esc(l.estrelas)}</span>` : ''}<span>${esc(l.categoria || l.tipo_contato || '')}</span>${prioBadge(l)}</div>
    </div>
    <div class="c-place"><span class="badge nicho">${esc(l.nicho || '—')}</span><span class="sub">${esc(l.cidade || '')} · ${esc(l.tipo_contato || '')}</span></div>
    <div class="c-tel"><span class="num">${esc(l.telefone || l.tel_digits)}</span><button class="ibtn ghost" data-act="copy-tel" data-tip="Copiar telefone">${ic('copy', 14)}</button></div>
    <div class="c-act">${leadIcons(l)}</div>
    <div class="c-status">${statusSelect(l, 'data-act="status"')}</div>
    <div class="c-when" data-tip="${esc(sinceTip(l))}">${taskFlag(l)}<span>${rel(l.status_updated_at || l.created_at)}</span></div>
  </div>`;
}

function leadCard(l) {
  return `<article class="card lead" data-id="${l.id}">
    <div class="top">
      <div style="flex:1;min-width:0"><a class="name" href="#/lead/${l.id}">${esc(l.nome)}</a>
        <div class="sub">${esc(l.categoria || '')}</div></div>
      ${l.estrelas ? `<span class="stars">★ ${esc(l.estrelas)}</span>` : ''}
    </div>
    <div class="badges"><span class="badge nicho">${esc(l.nicho || '—')}</span>${l.cidade ? `<span class="badge">${ic('pin', 11)}${esc(l.cidade)}</span>` : ''}${l.tipo_contato ? `<span class="badge">${esc(l.tipo_contato)}</span>` : ''}${prioBadge(l)}</div>
    <div class="addr" data-tip="${esc(l.endereco || '')}">${esc(l.endereco || 'Sem endereço')}</div>
    ${l.obs ? `<div class="obs" data-tip="${esc(l.obs)}">${esc(l.obs)}</div>` : ''}
    <div class="tel">${ic('phone', 14)} <span class="num">${esc(l.telefone || l.tel_digits)}</span>
      <button class="ibtn ghost" data-act="copy-tel" data-tip="Copiar telefone">${ic('copy', 14)}</button></div>
    <div class="actions">
      <a class="btn sm wa" href="${esc(l.wa_link)}" target="_blank" rel="noopener" data-act="wa">${ic('wa', 14)} WhatsApp</a>
      <a class="btn sm call" href="tel:+${esc(l.tel_digits)}" data-act="call">${ic('phone', 14)} Ligar</a>
      <span class="spacer"></span>
      <button class="ibtn" data-act="copy-msg" ${l.mensagem ? 'data-tip="Copiar mensagem"' : 'disabled data-tip="Sem mensagem — escreva no detalhe do lead"'}>${ic('msg', 15)}</button>
      ${l.rede_link ? `<a class="ibtn" href="${esc(l.rede_link)}" target="_blank" rel="noopener" data-tip="Ver ${REDE[l.rede_tipo] || 'perfil'}">${ic('link', 15)}</a>` : ''}
      ${l.maps_link ? `<a class="ibtn" href="${esc(l.maps_link)}" target="_blank" rel="noopener" data-tip="Ver no Google Maps">${ic('pin', 15)}</a>` : ''}
    </div>
    <div class="foot">
      ${statusSelect(l, 'data-act="status"')}
      ${taskFlag(l)}
      <span class="spacer"></span>
      <span class="muted" data-tip="${esc(sinceTip(l))}">${rel(l.status_updated_at || l.created_at)}</span>
    </div>
  </article>`;
}

function bindLeadActions(container, onUpdate) {
  container.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const card = a.closest('[data-id]'); const l = leadCache.get(Number(card?.dataset.id)); if (!l) return;
    if (a.dataset.act === 'copy-tel') copy(l.telefone || l.tel_digits, 'Telefone copiado');
    if (a.dataset.act === 'copy-msg') copy(l.mensagem, 'Mensagem copiada');
    if (a.dataset.act === 'wa') setTimeout(() => offerLog(l, 'whatsapp', onUpdate), 400);
    if (a.dataset.act === 'call') setTimeout(() => offerLog(l, 'ligacao', onUpdate), 400);
  });
  container.addEventListener('change', async e => {
    const s = e.target.closest('[data-act="status"]'); if (!s) return;
    const card = s.closest('[data-id]'); const l = leadCache.get(Number(card.dataset.id));
    const novo = s.value;
    s.value = l.status;
    try { const u = await askStatus(l, novo); if (u) onUpdate(u); } catch (err) { toastErr(err); }
  });
}

const FILTER_KEYS = ['q', 'nicho', 'cidade', 'tipo', 'prioridade', 'status', 'canal'];
const EXTRA_KEYS = ['tipo', 'prioridade', 'canal'];
let leadView = store.get('crm_leadView', 'lista');
const leadSel = new Set();

// Pergunta o que for preciso pra mudar o status de vários leads de uma vez.
async function askBulkStatus(count, novo) {
  const body = { status: novo };
  if (['Contatado', 'Respondeu', 'Responsável confirmado', 'Forte Lead', 'Negociando', 'Fechado', 'Perdido'].includes(novo)) {
    const canal = await modal(`
      <h3>Mudar ${n(count)} lead${count > 1 ? 's' : ''} para "${esc(stLabel(novo))}"</h3>
      <p>Os que ainda estão como Novo ganham uma tentativa de contato registrada. Por qual canal foi?</p>
      <div class="opts">
        <button class="opt" data-v="whatsapp"><b>${ic('wa')} WhatsApp</b></button>
        <button class="opt" data-v="ligacao"><b>${ic('phone')} Ligação</b></button>
        <button class="opt" data-v="-"><b>Não registrar canal</b><span class="muted small">só muda o status</span></button>
      </div>
      <div class="foot"><button class="btn ghost" data-cancel>Cancelar</button></div>`,
    (m, done) => $$('.opt', m).forEach(o => o.addEventListener('click', () => done(o.dataset.v))));
    if (!canal) return null;
    if (canal !== '-') body.canal = canal;
  }
  if (novo === 'Perdido') {
    const motivo = await modal(`
      <h3>Motivo da perda</h3><p>Vale pros ${n(count)} selecionados.</p>
      <div class="opts">${META.motivosPerda.map(m => `<button class="opt" data-v="${esc(m)}"><b>${esc(m)}</b></button>`).join('')}</div>
      <div class="foot"><button class="btn ghost" data-cancel>Cancelar</button></div>`,
    (m, done) => $$('.opt', m).forEach(o => o.addEventListener('click', () => done(o.dataset.v))));
    if (!motivo) return null;
    body.motivo_perda = motivo;
  }
  return body;
}

async function renderLeads(view) {
  await loadMeta();
  let offset = 0, total = 0;
  let showMore = EXTRA_KEYS.some(k => leadF[k]);
  const sel = (k, inner) => `<select class="input" data-f="${k}">${inner}</select>`;
  view.innerHTML = `
  <div class="fade-in">
    <div class="page-head">
      <div><h1>Leads</h1><p id="lcount">&nbsp;</p></div>
      <div class="row">
        <div class="seg" id="viewSeg">
          <button data-v="lista" class="${leadView === 'lista' ? 'on' : ''}">${ic('leads', 14)} Lista</button>
          <button data-v="cards" class="${leadView === 'cards' ? 'on' : ''}">${ic('dash', 14)} Cards</button>
        </div>
        <button class="btn primary" id="newLead">${ic('plus')} Novo lead</button>
      </div>
    </div>
    <div class="toolbar card">
      <div class="tb-main">
        <input class="input search" type="search" placeholder="Buscar nome, categoria, endereço ou telefone…" data-f="q" value="${esc(leadF.q)}">
        ${sel('nicho', optList(META.nichos, leadF.nicho, 'Todos os nichos'))}
        ${sel('cidade', optList(META.cidades, leadF.cidade, 'Todas as cidades'))}
        ${sel('sort', [['recentes', 'Mexidos recentemente'], ['parados', 'Parados há mais tempo'], ['nota', 'Maior nota'], ['nome', 'Nome A–Z'], ['antigos', 'Importados primeiro']].map(([k, v]) => `<option value="${k}" ${leadF.sort === k ? 'selected' : ''}>${v}</option>`).join(''))}
        <button class="btn ghost" id="moreF">Mais filtros <span id="moreN"></span></button>
      </div>
      <div class="tb-extra ${showMore ? '' : 'hide'}" id="extraF">
        ${sel('tipo', optList(META.tiposContato, leadF.tipo, 'Tipo de contato: todos'))}
        ${sel('prioridade', `<option value="">Prioridade: todas</option>${['alta', 'baixa', 'revisar'].map(p => `<option value="${p}" ${leadF.prioridade === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}`)}
        ${sel('canal', `<option value="">Canal do 1º contato: todos</option>${Object.entries(CANAL).map(([k, v]) => `<option value="${k}" ${leadF.canal === k ? 'selected' : ''}>${v}</option>`).join('')}`)}
      </div>
      <div class="chips" id="chips"></div>
    </div>
    <div id="list"></div>
    <div style="text-align:center;margin-top:18px"><button class="btn hide" id="more">Carregar mais</button></div>
  </div>`;
  const list = $('#list', view);
  const render = l => (leadView === 'lista' ? leadRow(l) : leadCard(l));
  const head = `<div class="lrow lhead"><div class="c-chk"><input type="checkbox" id="selAll" aria-label="Selecionar todos os carregados" data-tip="Selecionar todos os carregados"></div><div>Negócio</div><div>Nicho · cidade</div><div>Telefone</div><div>Ações</div><div>Status</div><div>Atualizado</div></div>`;

  async function load(reset = true) {
    if (reset) offset = 0;
    const q = new URLSearchParams(Object.entries(leadF).filter(([, v]) => v));
    q.set('offset', offset); q.set('limit', 60);
    const r = await api('/api/leads?' + q);
    total = r.total;
    r.items.forEach(l => leadCache.set(l.id, l));
    if (reset) list.className = leadView === 'lista' ? 'card lrows' : 'leads';
    const html = r.items.map(render).join('');
    if (reset) list.innerHTML = (leadView === 'lista' && total ? head : '') + html;
    else list.insertAdjacentHTML('beforeend', html);
    offset += r.items.length;
    if (!total) list.innerHTML = `<div class="empty" style="grid-column:1/-1">Nenhum lead com esses filtros.${META.nichos.length ? '' : ' <a href="#/importar">Importe uma planilha</a> pra começar.'}</div>`;
    $('#more', view).classList.toggle('hide', offset >= total);
    $('#more', view).textContent = `Carregar mais (${n(Math.max(total - offset, 0))} restantes)`;
    const nf = FILTER_KEYS.filter(k => leadF[k]).length;
    $('#lcount', view).innerHTML = `${n(total)} lead${total === 1 ? '' : 's'}${nf ? ` com ${nf} filtro${nf > 1 ? 's' : ''} · <a href="#" id="clearLF">limpar filtros</a>` : ''}`;
    const nx = EXTRA_KEYS.filter(k => leadF[k]).length;
    $('#moreN', view).textContent = nx ? `(${nx})` : '';
    syncBar();
    const ps = Object.fromEntries(r.porStatus.map(p => [p.status, p.n]));
    const all = r.porStatus.reduce((s, p) => s + p.n, 0);
    $('#chips', view).innerHTML = `<button class="chip ${!leadF.status ? 'on' : ''}" data-s="">Todos <b>${n(all)}</b></button>` +
      META.statuses.map(s => `<button class="chip st ${leadF.status === s ? 'on' : ''}" data-s="${esc(s)}"><span class="pill"></span>${esc(stLabel(s))} <b>${n(ps[s] || 0)}</b></button>`).join('');
  }
  const save = () => store.set('crm_leadF', leadF);
  $$('[data-f]', view).forEach(el => {
    const h = () => { leadF[el.dataset.f] = el.value; save(); load().catch(toastErr); };
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', el.tagName === 'INPUT' ? debounce(h, 250) : h);
  });
  $('#chips', view).addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    leadF.status = c.dataset.s; save(); load().catch(toastErr);
  });
  $('#moreF', view).addEventListener('click', () => { showMore = !showMore; $('#extraF', view).classList.toggle('hide', !showMore); });
  $('#lcount', view).addEventListener('click', e => {
    if (e.target.id !== 'clearLF') return;
    e.preventDefault();
    FILTER_KEYS.forEach(k => (leadF[k] = ''));
    $$('[data-f]', view).forEach(el => { if (el.dataset.f !== 'sort') el.value = ''; });
    save(); load().catch(toastErr);
  });
  $('#viewSeg', view).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === leadView) return;
    leadView = b.dataset.v; store.set('crm_leadView', leadView); leadSel.clear();
    $$('#viewSeg button', view).forEach(x => x.classList.toggle('on', x === b));
    load().catch(toastErr);
  });
  $('#more', view).addEventListener('click', () => load(false).catch(toastErr));

  // ----- seleção em massa (modo lista) -----
  const bar = document.createElement('div');
  bar.className = 'bulkbar hide';
  view.appendChild(bar);
  function syncBar() {
    bar.classList.toggle('hide', !leadSel.size);
    bar.innerHTML = `<b>${n(leadSel.size)} selecionado${leadSel.size > 1 ? 's' : ''}</b>
      <select class="input" id="bulkSt"><option value="">Mudar status para…</option>${META.statuses.map(s => `<option value="${esc(s)}">${esc(stLabel(s))}</option>`).join('')}</select>
      <button class="btn ghost sm" id="bulkClear">Limpar seleção</button>`;
    const all = $('#selAll', view);
    if (all) { const ids = $$('[data-sel]', list).map(c => Number(c.dataset.sel)); all.checked = ids.length > 0 && ids.every(id => leadSel.has(id)); }
  }
  list.addEventListener('change', e => {
    const c = e.target;
    if (c.id === 'selAll') {
      $$('[data-sel]', list).forEach(x => { x.checked = c.checked; const id = Number(x.dataset.sel); c.checked ? leadSel.add(id) : leadSel.delete(id); x.closest('.lrow').classList.toggle('sel', c.checked); });
    } else if (c.dataset.sel) {
      const id = Number(c.dataset.sel);
      c.checked ? leadSel.add(id) : leadSel.delete(id);
      c.closest('.lrow').classList.toggle('sel', c.checked);
    } else return;
    syncBar();
  });
  bar.addEventListener('click', e => { if (e.target.id === 'bulkClear') { leadSel.clear(); $$('[data-sel]', list).forEach(x => { x.checked = false; x.closest('.lrow').classList.remove('sel'); }); syncBar(); } });
  bar.addEventListener('change', async e => {
    if (e.target.id !== 'bulkSt' || !e.target.value) return;
    const novo = e.target.value;
    try {
      const body = await askBulkStatus(leadSel.size, novo);
      if (!body) return syncBar();
      const r = await api('/api/leads/bulk-status', { method: 'POST', body: { ...body, ids: [...leadSel] } });
      toast(`<b>${n(r.alterados)} lead${r.alterados === 1 ? '' : 's'}</b> → ${esc(stLabel(novo))}`);
      leadSel.clear();
      await load();
    } catch (err) { toastErr(err); }
    syncBar();
  });
  syncBar();

  bindLeadActions(list, u => {
    const old = leadCache.get(u.id); leadCache.set(u.id, { ...old, ...u });
    const el = $(`[data-id="${u.id}"]`, list);
    if (el) el.outerHTML = render(leadCache.get(u.id));
  });
  $('#newLead', view).addEventListener('click', () => newLeadModal());
  await load();
}

async function newLeadModal() {
  const r = await modal(`
    <h3>Novo lead</h3><p>Cadastro manual (indicação, avulso…). O telefone é a chave única.</p>
    <form id="nl">
      <label class="f"><span>Nome do negócio</span><input class="input" name="nome" required></label>
      <label class="f"><span>Telefone (com DDD)</span><input class="input" name="telefone" required placeholder="(12) 99999-9999"></label>
      <div class="grid g2" style="gap:10px">
        <label class="f"><span>Nicho</span><input class="input" name="nicho" list="dl-nichos" placeholder="Avulso"></label>
        <label class="f"><span>Cidade</span><input class="input" name="cidade" list="dl-cidades"></label>
      </div>
      <label class="f"><span>Link de rede social (opcional)</span><input class="input" name="rede_link" placeholder="https://instagram.com/..."></label>
      <label class="f"><span>Canal preferido</span><select class="input" name="canal_preferido"><option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option></select></label>
      <datalist id="dl-nichos">${META.nichos.map(x => `<option value="${esc(x.v)}">`).join('')}</datalist>
      <datalist id="dl-cidades">${META.cidades.map(x => `<option value="${esc(x.v)}">`).join('')}</datalist>
      <div class="foot"><button type="button" class="btn ghost" data-cancel>Cancelar</button><button class="btn primary">Salvar lead</button></div>
    </form>`,
  (m, done) => $('#nl', m).addEventListener('submit', async e => {
    e.preventDefault();
    try { done(await api('/api/leads', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) })); }
    catch (err) { toastErr(err); }
  }));
  if (r) { toast('Lead criado'); location.hash = `#/lead/${r.id}`; }
}

// ============================================================
// DETALHE DO LEAD
// ============================================================
let detailCanal = 'whatsapp';

function eventHtml(e, seq) {
  let icon = 'flag', cls = e.tipo, title = '', det = e.detalhe ? esc(e.detalhe) : '';
  if (e.tipo === 'status') { title = `Status: ${esc(stLabel(e.de))} → ${esc(stLabel(e.para))}`; cls = 'status'; }
  else if (e.tipo === 'contato') {
    icon = e.canal === 'ligacao' ? 'phone' : 'wa'; cls = e.canal;
    title = `${e.canal === 'ligacao' ? 'Ligação' : 'WhatsApp'} ${seq[e.id]}${e.resultado ? ' — ' + esc(e.resultado) : ''}`;
  } else if (e.tipo === 'nota') { icon = 'note'; title = 'Nota'; }
  else { icon = 'download'; title = 'Lead entrou no CRM'; }
  return `<div class="ev"><div class="ico ${cls}">${ic(icon, 15)}</div><div>
    <div class="t">${title}</div>${det ? `<div class="d">${det}</div>` : ''}
    <div class="w"><span data-tip="${esc(fmtDate(e.created_at))}">${fmtDate(e.created_at)} · ${rel(e.created_at)}</span>
    ${['nota', 'contato'].includes(e.tipo) ? `<button class="del" data-del-ev="${e.id}">remover</button>` : ''}</div></div></div>`;
}

function taskHtml(t) {
  const late = !t.done_at && t.due_at && new Date(t.due_at) < new Date();
  return `<div class="task ${t.done_at ? 'done' : ''} ${late ? 'late' : ''}">
    <input type="checkbox" data-task="${t.id}" ${t.done_at ? 'checked' : ''} aria-label="Concluir tarefa">
    <div style="min-width:0"><div class="tt">${esc(t.titulo)}</div>
      ${t.descricao ? `<div class="small muted">${esc(t.descricao)}</div>` : ''}
      <div class="tm">${t.done_at ? 'Concluída ' + rel(t.done_at) : t.due_at ? `${late ? 'Atrasada · ' : ''}${fmtDate(t.due_at)} (${rel(t.due_at)})` : 'Sem data'}</div></div>
    <button class="btn icon ghost sm x" data-del-task="${t.id}" data-tip="Excluir tarefa">${ic('trash', 14)}</button></div>`;
}

async function renderLead(view, id) {
  await loadMeta();
  const { lead: l, events, tasks } = await api(`/api/leads/${id}`);
  leadCache.set(l.id, l);
  detailCanal = l.canal_preferido || 'whatsapp';
  const seq = {}; const cnt = { whatsapp: 0, ligacao: 0 };
  [...events].reverse().forEach(e => { if (e.tipo === 'contato') seq[e.id] = ++cnt[e.canal]; });
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
  const field = (name, label, val, attrs = '') => `<label class="f"><span>${label}</span><input class="input" name="${name}" value="${esc(val)}" ${attrs}></label>`;
  const sel = (name, label, opts, val) => `<label class="f"><span>${label}</span><select class="input" name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;

  view.innerHTML = `
  <div class="fade-in">
    <a class="back" href="#/leads">${ic('back')} Voltar pros leads</a>
    <div class="d-head">
      <div class="avatar">${esc((l.nome || '?').trim()[0]?.toUpperCase())}</div>
      <div style="flex:1;min-width:200px">
        <h1>${esc(l.nome)}</h1>
        <div class="row small muted" style="margin-top:4px">${l.estrelas ? `<span class="stars">★ ${esc(l.estrelas)}</span>` : ''}
          ${l.nicho ? `<span class="badge nicho">${esc(l.nicho)}</span>` : ''}${l.cidade ? `<span class="badge">${ic('pin', 11)}${esc(l.cidade)}</span>` : ''}
          ${l.tipo_contato ? `<span class="badge">${esc(l.tipo_contato)}</span>` : ''}
          ${l.canal ? `<span class="badge ${l.canal}">1º contato: ${CANAL[l.canal]}</span>` : ''}
          ${l.status === 'Perdido' && l.motivo_perda ? `<span class="badge" style="color:var(--bad)">${esc(l.motivo_perda)}</span>` : ''}
          ${l.plano || l.valor_fechado != null ? `<span class="badge" style="color:var(--good)">${l.plano ? esc(META.planos[l.plano].label) + ' · ' : ''}${money(l.valor)}${l.manutencao ? ' + manutenção' : ''}</span>` : ''}</div>
      </div>
      <div class="row" data-id="${l.id}">
        <a class="btn wa" href="${esc(l.wa_link)}" target="_blank" rel="noopener" id="hWa">${ic('wa')} WhatsApp</a>
        <a class="btn call" href="tel:+${esc(l.tel_digits)}" id="hCall">${ic('phone')} Ligar</a>
        ${statusSelect(l, 'id="hStatus"')}
      </div>
    </div>

    <div class="detail">
      <div class="grid col-l" style="align-content:start">
        <div class="card">
          <div class="card-head"><h2>Dados do lead</h2></div>
          <form id="dados">
            ${field('nome', 'Nome do negócio', l.nome)}
            <label class="f"><span>Telefone</span><div class="row nowrap"><input class="input" name="telefone" value="${esc(l.telefone || '')}">
              <button type="button" class="btn icon" id="cpTel" data-tip="Copiar telefone">${ic('copy', 14)}</button></div>
              <span class="small muted" style="margin-top:4px">ID / WhatsApp: ${esc(l.tel_digits)}</span></label>
            <div class="grid g2" style="gap:10px">
              ${field('nicho', 'Nicho', l.nicho || '', 'list="dl-n"')}
              ${field('cidade', 'Cidade', l.cidade || '', 'list="dl-c"')}
            </div>
            ${field('categoria', 'Categoria (Google Maps)', l.categoria || '')}
            <div class="grid g2" style="gap:10px">
              ${sel('prioridade', 'Prioridade', [['alta', 'Alta'], ['baixa', 'Baixa'], ['revisar', 'Revisar']], l.prioridade)}
              ${sel('canal_preferido', 'Canal preferido', [['whatsapp', 'WhatsApp'], ['ligacao', 'Ligação']], l.canal_preferido)}
            </div>
            ${sel('tipo_contato', 'Tipo de contato', [['Sem site', 'Sem site'], ['Rede Social', 'Rede Social'], ...(l.tipo_contato && !['Sem site', 'Rede Social'].includes(l.tipo_contato) ? [[l.tipo_contato, l.tipo_contato]] : [])], l.tipo_contato)}
            <label class="f"><span>Rede social</span><div class="row nowrap"><input class="input" name="rede_link" value="${esc(l.rede_link || '')}" placeholder="https://instagram.com/...">
              ${l.rede_link ? `<a class="btn icon" href="${esc(l.rede_link)}" target="_blank" rel="noopener" data-tip="Abrir ${REDE[l.rede_tipo] || 'link'}">${ic('link', 14)}</a>` : ''}</div></label>
            <label class="f"><span>Google Maps</span><div class="row nowrap"><input class="input" name="maps_link" value="${esc(l.maps_link || '')}">
              ${l.maps_link ? `<a class="btn icon" href="${esc(l.maps_link)}" target="_blank" rel="noopener" data-tip="Ver no Maps">${ic('pin', 14)}</a>` : ''}</div></label>
            ${field('endereco', 'Endereço', l.endereco || '')}
            ${field('estrelas', 'Nota no Google', l.estrelas || '')}
            <hr class="sep">
            <div class="grid g2" style="gap:10px">
              ${sel('plano', 'Plano', [['', '—'], ...Object.entries(META.planos).map(([k, p]) => [k, `${p.label} (${money(p.valor)})`])], l.plano)}
              ${sel('manutencao', 'Manutenção', [['0', 'Não'], ['1', `Sim (+${money(META.manutencao)}/mês)`]], l.manutencao)}
            </div>
            <label class="f"><span>Valor fechado (R$) — se for diferente do plano</span><input class="input" type="number" min="0" step="1" name="valor_fechado" value="${l.valor_fechado ?? ''}" placeholder="ex: 650"></label>
            ${l.status === 'Perdido' ? sel('motivo_perda', 'Motivo da perda', META.motivosPerda.map(m => [m, m]), l.motivo_perda) : ''}
            <label class="f"><span>Observação</span><textarea class="input" name="obs" rows="3" placeholder="Correções, contexto da conversa…">${esc(l.obs || '')}</textarea></label>
            <datalist id="dl-n">${META.nichos.map(x => `<option value="${esc(x.v)}">`).join('')}</datalist>
            <datalist id="dl-c">${META.cidades.map(x => `<option value="${esc(x.v)}">`).join('')}</datalist>
            <div class="row"><button class="btn primary">Salvar dados</button><span class="spacer"></span><button type="button" class="btn ghost danger sm" id="delLead">${ic('trash', 14)} Excluir lead</button></div>
          </form>
        </div>
      </div>

      <div class="grid col-m" style="align-content:start">
        <div class="card">
          <div class="card-head"><h2>Mensagem de abordagem</h2><span class="muted small">texto que vai no WhatsApp</span></div>
          <textarea class="input" id="msg" rows="6" placeholder="Escreva ou cole aqui a mensagem pra esse lead…">${esc(l.mensagem || '')}</textarea>
          <div class="row" style="margin-top:10px">
            <button class="btn primary sm" id="saveMsg">Salvar mensagem</button>
            <button class="btn sm" id="cpMsg">${ic('copy', 14)} Copiar</button>
            <button class="btn sm wa" id="sendMsg">${ic('wa', 14)} Abrir WhatsApp com a mensagem</button>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Registrar contato</h2>
            <div class="seg" id="canalSeg">${Object.entries(CANAL).map(([k, v]) => `<button data-v="${k}" class="${detailCanal === k ? 'on' : ''}">${ic(k === 'ligacao' ? 'phone' : 'wa', 14)} ${v}</button>`).join('')}</div></div>
          <input class="input" id="cDet" placeholder="Detalhe (opcional) — ex: falei com a filha, dona volta sexta">
          <div class="quick" id="cRes"></div>
          <hr class="sep">
          <div class="row nowrap"><input class="input" id="nota" placeholder="Adicionar nota na timeline…"><button class="btn" id="addNota">${ic('note', 14)} Nota</button></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Histórico</h2><span class="muted small">${events.length} evento${events.length === 1 ? '' : 's'} · ${cnt.whatsapp} WhatsApp · ${cnt.ligacao} ligaç${cnt.ligacao === 1 ? 'ão' : 'ões'}</span></div>
          <div class="timeline">${events.map(e => eventHtml(e, seq)).join('') || '<div class="empty">Sem eventos</div>'}</div>
        </div>
      </div>

      <div class="grid col-r" style="align-content:start">
        <div class="card">
          <div class="card-head"><h2>Tarefas</h2><span class="muted small">${tasks.filter(t => !t.done_at).length} aberta(s)</span></div>
          <form id="tForm">
            <input class="input" name="titulo" value="Follow-up ${esc(l.nome)}" style="margin-bottom:8px">
            <input class="input" type="datetime-local" name="due" value="${toLocalInput(tomorrow)}" style="margin-bottom:6px">
            <div class="quick" style="margin-bottom:8px">${[['Hoje 17h', 0], ['+1 dia', 1], ['+3 dias', 3], ['+7 dias', 7], ['+15 dias', 15]].map(([t, d]) => `<button type="button" class="btn sm" data-days="${d}">${t}</button>`).join('')}</div>
            <textarea class="input" name="descricao" rows="2" placeholder="Descrição (opcional)" style="min-height:56px"></textarea>
            <button class="btn primary sm" style="margin-top:8px;width:100%">${ic('plus', 14)} Adicionar tarefa</button>
          </form>
          <hr class="sep">
          <div id="tList">${tasks.map(taskHtml).join('') || '<div class="empty">Sem tarefas pra esse lead.</div>'}</div>
        </div>
      </div>
    </div>
  </div>`;

  const reload = () => renderLead(view, id);
  const renderRes = () => {
    $('#cRes', view).innerHTML = META.resultados[detailCanal].map((r, i) =>
      `<button class="btn sm ${i === 0 ? (detailCanal === 'whatsapp' ? 'wa' : 'call') : ''}" data-r="${esc(r)}">${esc(r)}</button>`).join('');
  };
  renderRes();
  $('#canalSeg', view).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    detailCanal = b.dataset.v; $$('#canalSeg button', view).forEach(x => x.classList.toggle('on', x === b)); renderRes();
  });
  $('#cRes', view).addEventListener('click', async e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    try {
      await api(`/api/leads/${l.id}/contato`, { method: 'POST', body: { canal: detailCanal, resultado: b.dataset.r, detalhe: $('#cDet', view).value } });
      toast('Tentativa registrada');
      reload();
    } catch (err) { toastErr(err); }
  });
  const addNota = async () => {
    const v = $('#nota', view).value.trim(); if (!v) return;
    try { await api(`/api/leads/${l.id}/nota`, { method: 'POST', body: { detalhe: v } }); reload(); } catch (err) { toastErr(err); }
  };
  $('#addNota', view).addEventListener('click', addNota);
  $('#nota', view).addEventListener('keydown', e => { if (e.key === 'Enter') addNota(); });

  $('#hStatus', view).addEventListener('change', async e => {
    const novo = e.target.value; e.target.value = l.status;
    try { if (await askStatus(l, novo)) reload(); } catch (err) { toastErr(err); }
  });
  $('#hWa', view).addEventListener('click', () => setTimeout(() => offerLog(l, 'whatsapp', reload), 400));
  $('#hCall', view).addEventListener('click', () => setTimeout(() => offerLog(l, 'ligacao', reload), 400));
  $('#cpTel', view).addEventListener('click', () => copy(l.telefone || l.tel_digits, 'Telefone copiado'));

  const saveMsg = async () => api(`/api/leads/${l.id}`, { method: 'PATCH', body: { mensagem: $('#msg', view).value } });
  $('#saveMsg', view).addEventListener('click', async () => { try { Object.assign(l, await saveMsg()); toast('Mensagem salva'); } catch (err) { toastErr(err); } });
  $('#cpMsg', view).addEventListener('click', () => { const v = $('#msg', view).value; if (v) copy(v, 'Mensagem copiada'); });
  $('#sendMsg', view).addEventListener('click', async () => {
    try {
      const u = await saveMsg(); Object.assign(l, u);
      window.open(u.wa_link, '_blank', 'noopener');
      setTimeout(() => offerLog(l, 'whatsapp', reload), 400);
    } catch (err) { toastErr(err); }
  });

  $('#dados', view).addEventListener('submit', async e => {
    e.preventDefault();
    try { await api(`/api/leads/${l.id}`, { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) }); toast('Dados salvos'); reload(); }
    catch (err) { toastErr(err); }
  });
  $('#delLead', view).addEventListener('click', async () => {
    const ok = await modal(`<h3>Excluir ${esc(l.nome)}?</h3><p>Apaga o lead, o histórico e as tarefas dele, e o número fica bloqueado: se aparecer de novo numa planilha, é pulado. Se foi só um "não", prefira marcar como Perdido.</p>
      <div class="foot"><button class="btn ghost" data-cancel>Cancelar</button><button class="btn danger" id="okDel">Excluir</button></div>`,
    (m, done) => $('#okDel', m).addEventListener('click', () => done(true)));
    if (!ok) return;
    try { await api(`/api/leads/${l.id}`, { method: 'DELETE' }); toast('Lead excluído'); location.hash = '#/leads'; } catch (err) { toastErr(err); }
  });
  $$('[data-del-ev]', view).forEach(b => b.addEventListener('click', async () => {
    try { await api(`/api/events/${b.dataset.delEv}`, { method: 'DELETE' }); reload(); } catch (err) { toastErr(err); }
  }));

  const tf = $('#tForm', view);
  $$('[data-days]', tf).forEach(b => b.addEventListener('click', () => {
    const d = new Date(); const days = Number(b.dataset.days);
    if (days === 0) d.setHours(17, 0, 0, 0); else { d.setDate(d.getDate() + days); d.setHours(10, 0, 0, 0); }
    tf.due.value = toLocalInput(d);
  }));
  tf.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/tasks', { method: 'POST', body: { lead_id: l.id, titulo: tf.titulo.value, descricao: tf.descricao.value, due_at: fromLocalInput(tf.due.value) } });
      toast('Tarefa criada'); reload();
    } catch (err) { toastErr(err); }
  });
  bindTaskList($('#tList', view), reload);
}

function bindTaskList(el, after) {
  el.addEventListener('change', async e => {
    const c = e.target.closest('[data-task]'); if (!c) return;
    try { await api(`/api/tasks/${c.dataset.task}`, { method: 'PATCH', body: { done: c.checked } }); after(); refreshLateBadge(); } catch (err) { toastErr(err); }
  });
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-del-task]'); if (!b) return;
    try { await api(`/api/tasks/${b.dataset.delTask}`, { method: 'DELETE' }); after(); refreshLateBadge(); } catch (err) { toastErr(err); }
  });
}

// ============================================================
// TAREFAS
// ============================================================
async function renderTasks(view) {
  const [open, done] = await Promise.all([api('/api/tasks?scope=open'), api('/api/tasks?scope=done')]);
  const now = new Date(), t0 = startOfToday(), t1 = new Date(t0.getTime() + 864e5);
  const groups = [
    ['Atrasadas', open.filter(t => t.due_at && new Date(t.due_at) < now), 'var(--bad)'],
    ['Hoje', open.filter(t => t.due_at && new Date(t.due_at) >= now && new Date(t.due_at) < t1)],
    ['Próximas', open.filter(t => t.due_at && new Date(t.due_at) >= t1)],
    ['Sem data', open.filter(t => !t.due_at)],
  ];
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
  const withLead = t => taskHtml(t).replace('<div class="tm">', `${t.lead_id ? `<div class="small"><a href="#/lead/${t.lead_id}">${esc(t.lead_nome)}</a> <span class="pill st" data-s="${esc(t.lead_status)}">${esc(stLabel(t.lead_status))}</span></div>` : ''}<div class="tm">`);
  view.innerHTML = `
  <div class="fade-in">
    <div class="page-head"><div><h1>Tarefas</h1><p>${open.length} aberta(s) · lembretes de follow-up</p></div></div>
    <div class="grid g21">
      <div class="grid" style="align-content:start">
        ${groups.map(([title, items, color]) => `<div class="card"><div class="card-head"><h2 style="${color ? `color:${color}` : ''}">${title}</h2><span class="muted small">${items.length}</span></div>
          <div class="tl">${items.map(withLead).join('') || '<div class="empty">Nada aqui.</div>'}</div></div>`).join('')}
        <div class="card"><div class="card-head"><h2>Concluídas recentemente</h2><span class="muted small">${done.length}</span></div>
          <div class="tl">${done.slice(0, 20).map(withLead).join('') || '<div class="empty">Nenhuma ainda.</div>'}</div></div>
      </div>
      <div class="card" style="align-self:start">
        <div class="card-head"><h2>Nova tarefa</h2></div>
        <form id="nt">
          <label class="f"><span>Título</span><input class="input" name="titulo" required placeholder="Follow-up …"></label>
          <label class="f"><span>Lead (opcional)</span><input class="input" id="leadPick" list="dl-leads" placeholder="Digite o nome do lead…" autocomplete="off"></label>
          <datalist id="dl-leads"></datalist>
          <label class="f"><span>Vencimento</span><input class="input" type="datetime-local" name="due" value="${toLocalInput(tomorrow)}"></label>
          <label class="f"><span>Descrição</span><textarea class="input" name="descricao" rows="3"></textarea></label>
          <button class="btn primary" style="width:100%">${ic('plus', 14)} Criar tarefa</button>
        </form>
      </div>
    </div>
  </div>`;
  $$('.tl', view).forEach(el => bindTaskList(el, () => renderTasks(view)));
  const picks = new Map();
  $('#leadPick', view).addEventListener('input', debounce(async e => {
    const v = e.target.value.trim(); if (v.length < 2 || picks.has(v)) return;
    const r = await api('/api/leads?limit=10&sort=nome&q=' + encodeURIComponent(v));
    r.items.forEach(l => picks.set(`${l.nome} — ${l.cidade || ''}`.trim(), l.id));
    $('#dl-leads', view).innerHTML = r.items.map(l => `<option value="${esc(`${l.nome} — ${l.cidade || ''}`.trim())}">`).join('');
  }, 200));
  $('#nt', view).addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target; const pick = $('#leadPick', view).value.trim();
    if (pick && !picks.has(pick)) return toast('Escolha o lead na lista de sugestões (ou deixe em branco)', { err: true });
    try {
      await api('/api/tasks', { method: 'POST', body: { titulo: f.titulo.value, descricao: f.descricao.value, due_at: fromLocalInput(f.due.value), lead_id: picks.get(pick) || null } });
      toast('Tarefa criada'); renderTasks(view);
    } catch (err) { toastErr(err); }
  });
}

// ============================================================
// IMPORTAÇÃO
// ============================================================
const FIELD_LABEL = {
  nome: 'nome', telefone: 'telefone', estrelas: 'estrelas', categoria: 'categoria', tipo_contato: 'tipoContato',
  rede_link: 'redeLink', rede_tipo: 'redeTipo', endereco: 'endereço', maps_link: 'mapsLink', wa_link_col: 'mensagem (do link WA)',
  busca_origem: 'nicho/cidade (busca)', motivo_exclusao: 'prioridade (exclusão)', franquia: 'prioridade (franquia)', obs: 'obs',
  mensagem: 'mensagem', nicho: 'nicho', cidade: 'cidade', prioridade: 'prioridade', status: 'status',
};

async function renderImport(view) {
  await loadMeta();
  view.innerHTML = `
  <div class="fade-in">
    <div class="page-head"><div><h1>Importar</h1><p>Planilha do scraper (.xlsx), JSON do CRM antigo ou status salvos no navegador.</p></div>
      <a class="btn" href="/api/export">${ic('download', 14)} Backup (JSON)</a></div>
    <label class="drop" id="drop">
      <input type="file" id="file" accept=".xlsx,.json" hidden>
      ${ic('upload', 30)}<b>Arraste a planilha aqui ou clique pra escolher</b>
      <span class="muted">.xlsx do Lead Bot (uma aba por busca) · telefone vira a chave única — lead repetido é atualizado, não duplicado</span>
    </label>
    <div id="preview" style="margin-top:16px"></div>
    <div style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Como a planilha é lida</h2></div>
        <div class="statlist">
          <div><span>Nome do Negócio</span><b>nome</b></div>
          <div><span>Telefone / WhatsApp</span><b>telefone → telDigits (55…)</b></div>
          <div><span>Avaliação (Estrelas)</span><b>estrelas</b></div>
          <div><span>Categoria / Nicho</span><b>categoria</b></div>
          <div><span>Tipo de Contato</span><b>tipoContato</b></div>
          <div><span>Site / Rede Social</span><b>redeLink (+ redeTipo)</b></div>
          <div><span>Endereço · Link Google Maps</span><b>endereço · mapsLink</b></div>
          <div><span>Busca de Origem / nome do arquivo</span><b>sugere nicho e cidade</b></div>
          <div><span>Motivo de Exclusão preenchido</span><b>prioridade "revisar"</b></div>
        </div>
        <p class="small muted" style="margin-bottom:0">Ao atualizar um lead que já existe, status, mensagem e observação dele são mantidos.</p>
      </div>
    </div>
  </div>`;

  const drop = $('#drop', view), file = $('#file', view);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]));
  file.addEventListener('change', () => file.files[0] && handleFile(file.files[0]));

  async function applyStatus(map) {
    try {
      const r = await api('/api/import/status', { method: 'POST', body: { map } });
      toast(`<b>${n(r.aplicados)} status aplicados.</b>${r.naoEncontrados ? ` ${n(r.naoEncontrados)} não encontrados na base.` : ''}`, { ms: 6000 });
    } catch (e) { toastErr(e); }
  }
  async function handleFile(f) {
    const pv = $('#preview', view);
    pv.innerHTML = '<div class="skeleton"></div>';
    const fd = new FormData(); fd.append('arquivo', f);
    let data;
    try { data = await api('/api/import/preview', { method: 'POST', body: fd }); }
    catch (e) { pv.innerHTML = ''; return toastErr(e); }
    file.value = '';
    if (data.kind === 'status') {
      pv.innerHTML = `<div class="card"><h2>Arquivo de status do CRM antigo</h2><p class="muted">${n(data.total)} registros encontrados.</p><button class="btn primary" id="applyFileSt">Aplicar status</button></div>`;
      $('#applyFileSt', pv).addEventListener('click', () => applyStatus(data.map));
      return;
    }
    const total = data.sheets.reduce((s, sh) => s + sh.rows.length - sh.semTelefone, 0);
    pv.innerHTML = `<div class="card">
      <div class="card-head"><div><h2>${esc(data.filename)}</h2><span class="muted small">${data.sheets.length} aba(s) · ${n(total)} leads com telefone</span></div>
        <div class="row"><button class="btn ghost" id="cancelImp">Cancelar</button><button class="btn primary" id="doImp">Importar ${n(total)} leads</button></div></div>
      ${data.sheets.map((s, i) => `<div class="sheet" data-i="${i}" style="${i ? 'margin-top:20px;padding-top:18px;border-top:1px solid var(--line)' : ''}">
        <div class="row" style="margin-bottom:10px"><b>${esc(s.name)}</b><span class="badge">${n(s.rows.length)} linhas</span>
          ${s.jaExistem ? `<span class="badge revisar" data-tip="Já estão no CRM: os dados são atualizados, mas o status e o histórico ficam como estão">${n(s.jaExistem)} já estão no CRM${s.jaEmAndamento || s.jaPerdidos ? ` (${[s.jaEmAndamento && n(s.jaEmAndamento) + ' em andamento', s.jaPerdidos && n(s.jaPerdidos) + ' perdidos'].filter(Boolean).join(', ')})` : ''} — status mantido</span>` : ''}
          ${s.descartados ? `<span class="badge">${n(s.descartados)} excluídos antes (pulados)</span>` : ''}
          ${s.semTelefone ? `<span class="badge">${n(s.semTelefone)} sem telefone (ignorados)</span>` : ''}</div>
        <div class="grid g4" style="gap:10px">
          <label class="f"><span>Nicho do lote (vale pra todas as linhas)</span><input class="input" data-k="nicho" list="dl-in" value="${esc(s.suggestion.nicho)}" placeholder="ex: Confeitaria"></label>
          <label class="f"><span>Cidade (se não der pra ler do endereço)</span><input class="input" data-k="cidade" list="dl-ic" value="${esc(s.suggestion.cidade)}" placeholder="ex: Taubaté"></label>
          <label class="f"><span>Prioridade padrão</span><select class="input" data-k="prioridade"><option value="alta">Alta</option><option value="baixa">Baixa</option><option value="revisar">Revisar</option></select></label>
          <label class="f" style="display:flex;align-items:flex-end;gap:8px"><input type="checkbox" data-k="force" style="margin-bottom:11px"><span style="margin-bottom:8px">Aplicar nicho/cidade também nos que já existem</span></label>
        </div>
        ${s.columns.length ? `<div class="maplist small" style="margin-bottom:10px">${s.columns.map(c => `<span class="badge ${c.field ? '' : 'off'}" data-tip="${c.field ? 'vira: ' + esc(FIELD_LABEL[c.field] || c.field) : 'coluna ignorada'}">${esc(c.header)}</span>`).join('')}</div>` : ''}
        <div class="tbl-wrap" style="max-height:260px"><table class="tbl"><thead><tr><th>Nome</th><th>Telefone</th><th>Categoria</th><th>Cidade</th><th>Tipo</th><th>Rede</th><th>★</th><th>Msg</th></tr></thead>
          <tbody>${s.rows.slice(0, 8).map(r => `<tr style="${r.tel_digits ? '' : 'opacity:.45'}"><td>${esc(r.nome)}</td><td>${esc(r.telefone)}</td><td>${esc(r.categoria)}</td><td>${esc(r.cidade)}</td><td>${esc(r.tipo_contato)}</td><td>${esc(r.rede_tipo)}</td><td>${esc(r.estrelas)}</td><td>${r.mensagem ? '✓' : ''}</td></tr>`).join('')}</tbody></table></div>
        ${s.rows.length > 8 ? `<div class="small muted" style="margin-top:6px">+ ${n(s.rows.length - 8)} linhas</div>` : ''}
      </div>`).join('')}
      <datalist id="dl-in">${META.nichos.map(x => `<option value="${esc(x.v)}">`).join('')}</datalist>
      <datalist id="dl-ic">${META.cidades.map(x => `<option value="${esc(x.v)}">`).join('')}</datalist>
    </div>`;
    $('#cancelImp', pv).addEventListener('click', () => (pv.innerHTML = ''));
    $('#doImp', pv).addEventListener('click', async e => {
      e.target.disabled = true; e.target.textContent = 'Importando…';
      const batches = $$('.sheet', pv).map(el => {
        const s = data.sheets[el.dataset.i];
        return {
          rows: s.rows, origem: `${data.filename}${data.sheets.length > 1 ? ' / ' + s.name : ''}`,
          nicho: $('[data-k="nicho"]', el).value, cidade: $('[data-k="cidade"]', el).value,
          prioridade: $('[data-k="prioridade"]', el).value, forceNichoCidade: $('[data-k="force"]', el).checked,
        };
      });
      try {
        const r = await api('/api/import/commit', { method: 'POST', body: { batches } });
        pv.innerHTML = `<div class="card fade-in"><h2 style="color:var(--good)">Importação concluída</h2>
          <div class="statlist" style="margin-top:12px;max-width:380px"><div><span>Leads novos</span><b>${n(r.criados)}</b></div><div><span>Atualizados (já existiam)</span><b>${n(r.atualizados)}</b></div><div><span>Ignorados (sem telefone)</span><b>${n(r.ignorados)}</b></div>${r.descartados ? `<div><span>Pulados (excluídos antes)</span><b>${n(r.descartados)}</b></div>` : ''}</div>
          <div class="row" style="margin-top:14px"><a class="btn primary" href="#/leads">Ver leads</a><a class="btn" href="#/dashboard">Dashboard</a></div></div>`;
        await loadMeta();
      } catch (err) { toastErr(err); e.target.disabled = false; e.target.textContent = 'Tentar de novo'; }
    });
  }
}

// ============================================================
// LOGIN + INICIALIZAÇÃO
// ============================================================
function showLogin() {
  $('#app').innerHTML = `<div class="login"><form class="card" id="login">
    <img src="/logo.jpg" alt=""><h1 style="margin-bottom:4px">CRM JC Automações</h1><p class="muted" style="margin:0 0 18px">Digite a senha pra entrar</p>
    <input class="input" type="password" name="senha" placeholder="Senha" autofocus required style="margin-bottom:12px">
    <button class="btn primary" style="width:100%">Entrar</button></form></div>`;
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/api/login', { method: 'POST', body: { senha: e.target.senha.value } }); start(); }
    catch (err) { toastErr(err); e.target.senha.select(); }
  });
}

async function start() {
  ME = await api('/api/me');
  if (!ME.authed) return showLogin();
  shell();
  route();
}
window.addEventListener('hashchange', route);
start().catch(toastErr);
