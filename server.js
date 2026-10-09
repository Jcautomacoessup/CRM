// CRM de Prospecção — JC Automações. Um processo, uma porta: API + frontend.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const {
  db, STAGES, STATUSES, PLANOS, VALOR_PADRAO, MANUTENCAO_MENSAL, MOTIVOS_PERDA, RESULTADOS,
  normalizePhone, inferRedeTipo, decorate, addEvent, changeStatus, logContato, now, leadValor, DATA_DIR,
} = require('./db');
const { parseXlsx, parseJson, upsertBatch, importStatusMap } = require('./importer');

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.CRM_PASSWORD || '';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '25mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// ---------- Senha simples de acesso ----------
const secretFile = path.join(DATA_DIR, '.secret');
const SECRET = process.env.SESSION_SECRET || (() => {
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8');
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, s);
  return s;
})();
const COOKIE = 'crm_auth';
const sign = v => crypto.createHmac('sha256', SECRET + PASSWORD).update(v).digest('hex');
const makeToken = () => { const exp = String(Date.now() + 30 * 864e5); return `${exp}.${sign(exp)}`; };
function validToken(t) {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
const readCookie = req => (req.headers.cookie || '').split(';').map(s => s.trim())
  .find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
const isAuthed = req => !PASSWORD || validToken(readCookie(req));

app.post('/api/login', (req, res) => {
  const ok = PASSWORD && typeof req.body?.senha === 'string' &&
    crypto.timingSafeEqual(crypto.createHash('sha256').update(req.body.senha).digest(), crypto.createHash('sha256').update(PASSWORD).digest());
  if (!ok) return setTimeout(() => res.status(401).json({ error: 'Senha incorreta' }), 700);
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${secure}`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json({ authed: isAuthed(req), passwordEnabled: !!PASSWORD }));
app.use('/api', (req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: 'Não autenticado' })));

const wrap = fn => (req, res) => {
  try { const out = fn(req, res); if (out instanceof Promise) out.catch(e => fail(res, e)); } catch (e) { fail(res, e); }
};
function fail(res, e) { console.error(e); if (!res.headersSent) res.status(400).json({ error: e.message || String(e) }); }

// ---------- Metadados ----------
app.get('/api/meta', wrap((req, res) => {
  const distinct = col => db.prepare(`SELECT ${col} v, COUNT(*) n FROM leads WHERE ${col} IS NOT NULL AND ${col} <> '' GROUP BY ${col} ORDER BY n DESC`).all();
  res.json({
    stages: STAGES, statuses: STATUSES, planos: PLANOS, valorPadrao: VALOR_PADRAO, manutencao: MANUTENCAO_MENSAL,
    motivosPerda: MOTIVOS_PERDA, resultados: RESULTADOS,
    nichos: distinct('nicho'), cidades: distinct('cidade'), tiposContato: distinct('tipo_contato'),
  });
}));

// ---------- Leads ----------
function leadFilters(q) {
  const where = [], params = {};
  if (q.q) {
    where.push(`(nome LIKE @q OR categoria LIKE @q OR endereco LIKE @q OR obs LIKE @q OR tel_digits LIKE @qd)`);
    params.q = `%${q.q}%`; params.qd = `%${String(q.q).replace(/\D/g, '') || '§'}%`;
  }
  for (const [key, col] of [['nicho', 'nicho'], ['cidade', 'cidade'], ['tipo', 'tipo_contato'], ['prioridade', 'prioridade'], ['status', 'status'], ['canal', 'canal']]) {
    if (q[key]) { where.push(`${col} = @${key}`); params[key] = q[key]; }
  }
  if (q.desde) { where.push('created_at >= @desde'); params.desde = q.desde; }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

const SORTS = {
  recentes: 'COALESCE(status_updated_at, created_at) DESC, id DESC',
  nome: 'nome COLLATE NOCASE ASC',
  nota: 'CAST(estrelas AS REAL) DESC, nome COLLATE NOCASE',
  antigos: 'created_at ASC, id ASC',
  parados: "CASE WHEN status IN ('Fechado','Perdido','Novo') THEN 1 ELSE 0 END, COALESCE(status_updated_at, created_at) ASC",
};

app.get('/api/leads', wrap((req, res) => {
  const { sql, params } = leadFilters(req.query);
  const limit = Math.min(Number(req.query.limit) || 60, 500);
  const offset = Number(req.query.offset) || 0;
  const order = SORTS[req.query.sort] || SORTS.recentes;
  const total = db.prepare(`SELECT COUNT(*) n FROM leads ${sql}`).get(params).n;
  const items = db.prepare(`SELECT * FROM leads ${sql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`).all(params).map(decorate);
  const ids = items.map(i => i.id);
  if (ids.length) {
    const open = db.prepare(`SELECT lead_id, COUNT(*) n, MIN(due_at) prox FROM tasks WHERE done_at IS NULL AND lead_id IN (${ids.join(',')}) GROUP BY lead_id`).all();
    const map = Object.fromEntries(open.map(o => [o.lead_id, o]));
    items.forEach(i => { i.tarefas_abertas = map[i.id]?.n || 0; i.proxima_tarefa = map[i.id]?.prox || null; });
  }
  // contagem por status respeitando os outros filtros (pra faixa de chips)
  const { sql: sql2, params: p2 } = leadFilters({ ...req.query, status: '' });
  const porStatus = db.prepare(`SELECT status, COUNT(*) n FROM leads ${sql2} GROUP BY status`).all(p2);
  res.json({ total, items, porStatus });
}));

app.get('/api/leads/:id', wrap((req, res) => {
  const lead = decorate(db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  const events = db.prepare('SELECT * FROM events WHERE lead_id = ? ORDER BY created_at DESC, id DESC').all(lead.id);
  const tasks = db.prepare('SELECT * FROM tasks WHERE lead_id = ? ORDER BY done_at IS NOT NULL, due_at').all(lead.id);
  res.json({ lead, events, tasks });
}));

const EDITABLE = ['nome', 'telefone', 'estrelas', 'categoria', 'endereco', 'tipo_contato', 'rede_link', 'rede_tipo', 'maps_link',
  'mensagem', 'obs', 'nicho', 'cidade', 'prioridade', 'canal_preferido', 'plano', 'manutencao', 'motivo_perda', 'valor_fechado'];

app.post('/api/leads', wrap((req, res) => {
  const b = req.body || {};
  const tel = normalizePhone(b.telefone);
  if (!tel) throw new Error('Telefone inválido (use DDD + número)');
  if (db.prepare('SELECT id FROM leads WHERE tel_digits = ?').get(tel)) throw new Error('Já existe um lead com esse telefone');
  const ts = now();
  const info = db.prepare(`INSERT INTO leads (tel_digits, nome, telefone, categoria, endereco, tipo_contato, rede_link, rede_tipo,
    maps_link, mensagem, obs, nicho, cidade, prioridade, canal_preferido, created_at, updated_at)
    VALUES (@tel, @nome, @telefone, @categoria, @endereco, @tipo_contato, @rede_link, @rede_tipo, @maps_link, @mensagem, @obs,
    @nicho, @cidade, @prioridade, @canal_preferido, @ts, @ts)`).run({
    tel, ts, nome: b.nome || '(sem nome)', telefone: b.telefone, categoria: b.categoria || null, endereco: b.endereco || null,
    tipo_contato: b.rede_link ? 'Rede Social' : 'Sem site', rede_link: b.rede_link || null, rede_tipo: inferRedeTipo(b.rede_link),
    maps_link: b.maps_link || null, mensagem: b.mensagem || null, obs: b.obs || null, nicho: b.nicho || 'Avulso',
    cidade: b.cidade || null, prioridade: b.prioridade || 'alta', canal_preferido: b.canal_preferido === 'ligacao' ? 'ligacao' : 'whatsapp',
  });
  addEvent({ lead_id: info.lastInsertRowid, tipo: 'import', detalhe: 'Cadastrado manualmente' });
  res.json(decorate(db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid)));
}));

app.patch('/api/leads/:id', wrap((req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  const upd = {};
  for (const k of EDITABLE) if (k in req.body) upd[k] = req.body[k] === '' ? null : req.body[k];
  if ('manutencao' in upd) upd.manutencao = upd.manutencao ? 1 : 0;
  if ('valor_fechado' in upd) upd.valor_fechado = upd.valor_fechado == null || isNaN(Number(upd.valor_fechado)) ? null : Math.round(Number(upd.valor_fechado));
  if ('prioridade' in upd && !['alta', 'baixa', 'revisar'].includes(upd.prioridade)) delete upd.prioridade;
  if ('canal_preferido' in upd && !['whatsapp', 'ligacao'].includes(upd.canal_preferido)) delete upd.canal_preferido;
  if ('plano' in upd && upd.plano && !PLANOS[upd.plano]) delete upd.plano;
  if ('rede_link' in upd && !('rede_tipo' in req.body)) upd.rede_tipo = inferRedeTipo(upd.rede_link);
  if ('rede_link' in upd && !('tipo_contato' in req.body) && lead.tipo_contato !== 'Site fora do ar') upd.tipo_contato = upd.rede_link ? 'Rede Social' : 'Sem site';
  const keys = Object.keys(upd);
  if (keys.length) {
    db.prepare(`UPDATE leads SET ${keys.map(k => `${k}=@${k}`).join(', ')}, updated_at=@updated_at WHERE id=@id`)
      .run({ ...upd, updated_at: now(), id: lead.id });
  }
  res.json(decorate(db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id)));
}));

app.delete('/api/leads/:id', wrap((req, res) => {
  const lead = db.prepare('SELECT tel_digits, nome FROM leads WHERE id = ?').get(req.params.id);
  if (lead) db.prepare('INSERT OR REPLACE INTO descartados (tel_digits, nome, created_at) VALUES (?, ?, ?)').run(lead.tel_digits, lead.nome, now());
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.post('/api/leads/:id/status', wrap((req, res) => {
  const { status, motivo_perda, plano, manutencao, canal, detalhe } = req.body || {};
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  // Novo -> Contatado pelo seletor: registra a tentativa com o canal escolhido.
  if (status === 'Contatado' && lead.status === 'Novo' && RESULTADOS[canal]) {
    return res.json(logContato(lead.id, { canal, resultado: canal === 'whatsapp' ? 'Mensagem enviada' : null }));
  }
  if (motivo_perda && !MOTIVOS_PERDA.includes(motivo_perda)) throw new Error('Motivo inválido');
  res.json(changeStatus(lead.id, status, { motivo_perda, plano, manutencao, detalhe }));
}));

// Mudança de status em vários leads de uma vez (ex.: corrigir quem já foi abordado)
app.post('/api/leads/bulk-status', wrap((req, res) => {
  const { ids = [], status, canal, motivo_perda, detalhe } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new Error('Nenhum lead selecionado');
  if (!STATUSES.includes(status)) throw new Error('Status inválido');
  if (motivo_perda && !MOTIVOS_PERDA.includes(motivo_perda)) throw new Error('Motivo inválido');
  let alterados = 0;
  db.transaction(() => {
    for (const id of ids.map(Number)) {
      const lead = db.prepare('SELECT id, status FROM leads WHERE id = ?').get(id);
      if (!lead || lead.status === status) continue;
      // marcar como contatado registra a tentativa no canal escolhido
      if (RESULTADOS[canal] && lead.status === 'Novo') {
        logContato(id, { canal, resultado: canal === 'whatsapp' ? 'Mensagem enviada' : null, detalhe });
        if (status !== 'Contatado') changeStatus(id, status, { motivo_perda, detalhe });
      } else {
        changeStatus(id, status, { motivo_perda, detalhe });
      }
      alterados++;
    }
  })();
  res.json({ alterados });
}));

app.post('/api/leads/:id/contato', wrap((req, res) => {
  const { canal, resultado, detalhe } = req.body || {};
  res.json(logContato(Number(req.params.id), { canal, resultado, detalhe }));
}));

app.post('/api/leads/:id/nota', wrap((req, res) => {
  const detalhe = String(req.body?.detalhe || '').trim();
  if (!detalhe) throw new Error('Nota vazia');
  addEvent({ lead_id: Number(req.params.id), tipo: 'nota', detalhe });
  res.json({ ok: true });
}));

app.delete('/api/events/:id', wrap((req, res) => {
  db.prepare("DELETE FROM events WHERE id = ? AND tipo IN ('nota','contato')").run(req.params.id);
  res.json({ ok: true });
}));

// ---------- Tarefas ----------
app.get('/api/tasks', wrap((req, res) => {
  const scope = req.query.scope || 'open';
  const where = scope === 'open' ? 'WHERE t.done_at IS NULL' : scope === 'done' ? 'WHERE t.done_at IS NOT NULL' : '';
  const order = scope === 'done' ? 't.done_at DESC LIMIT 100' : "CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at";
  res.json(db.prepare(`SELECT t.*, l.nome lead_nome, l.status lead_status FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id ${where} ORDER BY ${order}`).all());
}));
app.post('/api/tasks', wrap((req, res) => {
  const { titulo, descricao, due_at, lead_id } = req.body || {};
  if (!String(titulo || '').trim()) throw new Error('Dê um título pra tarefa');
  const info = db.prepare('INSERT INTO tasks (lead_id, titulo, descricao, due_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(lead_id || null, titulo.trim(), descricao || null, due_at || null, now());
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
}));
app.patch('/api/tasks/:id', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tarefa não encontrada' });
  const b = req.body || {};
  const next = {
    titulo: b.titulo ?? t.titulo, descricao: b.descricao ?? t.descricao, due_at: b.due_at ?? t.due_at,
    done_at: 'done' in b ? (b.done ? now() : null) : t.done_at,
  };
  db.prepare('UPDATE tasks SET titulo=@titulo, descricao=@descricao, due_at=@due_at, done_at=@done_at WHERE id=@id').run({ ...next, id: t.id });
  if ('done' in b && b.done && t.lead_id) addEvent({ lead_id: t.lead_id, tipo: 'nota', detalhe: `Tarefa concluída: ${t.titulo}` });
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id));
}));
app.delete('/api/tasks/:id', wrap((req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- Dashboard ----------
app.get('/api/dashboard', wrap((req, res) => {
  const q = req.query;
  const hoje = q.hoje || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const amanha = new Date(new Date(hoje).getTime() + 864e5).toISOString();
  const agora = now();
  const { sql, params } = leadFilters({ nicho: q.nicho, cidade: q.cidade, canal: q.canal, desde: q.desde });
  const leads = db.prepare(`SELECT id, status, stage_max, plano, valor_fechado, manutencao, canal, nicho, cidade, tipo_contato, motivo_perda FROM leads ${sql}`).all(params);
  const ids = new Set(leads.map(l => l.id));

  const funnel = STAGES.map((s, i) => ({ ...s, count: leads.filter(l => l.stage_max >= i).length }));
  funnel.forEach((f, i) => {
    f.cumPct = funnel[0].count ? f.count / funnel[0].count : 0;
    f.nextPct = i < funnel.length - 1 && f.count ? funnel[i + 1].count / f.count : null;
    f.agora = leads.filter(l => l.status === f.status).length; // quantos estão parados nessa etapa agora
    f.perdidosAqui = leads.filter(l => l.status === 'Perdido' && l.stage_max === i).length;
  });

  const fechados = leads.filter(l => l.status === 'Fechado');
  const negociando = leads.filter(l => l.status === 'Negociando');
  const perdidos = leads.filter(l => l.status === 'Perdido');
  const soma = arr => arr.reduce((s, l) => s + leadValor(l), 0);

  const events = db.prepare(`SELECT lead_id, tipo, canal, resultado, created_at FROM events WHERE tipo IN ('status','contato') AND created_at >= ?`).all(hoje)
    .filter(e => ids.has(e.lead_id));

  const allContatos = db.prepare(`SELECT lead_id, canal FROM events WHERE tipo = 'contato'`).all().filter(e => ids.has(e.lead_id));
  const canais = ['whatsapp', 'ligacao'].map(c => {
    const ls = leads.filter(l => l.canal === c);
    const contatados = ls.length;
    return {
      canal: c,
      contatados,
      tentativas: allContatos.filter(e => e.canal === c).length,
      responderam: ls.filter(l => l.stage_max >= 2).length,
      negociando: ls.filter(l => l.stage_max >= 5).length,
      fechados: ls.filter(l => l.stage_max >= 6).length,
    };
  });

  const group = (key, arr = leads) => {
    const m = {};
    arr.forEach(l => { const k = l[key] || '—'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
  };

  const tasksOpen = db.prepare(`SELECT t.*, l.nome lead_nome FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id
    WHERE t.done_at IS NULL AND t.due_at IS NOT NULL AND t.due_at < ? ORDER BY t.due_at`).all(amanha);

  const recentes = db.prepare(`SELECT e.*, l.nome lead_nome FROM events e JOIN leads l ON l.id = e.lead_id
    WHERE e.tipo IN ('status','contato','nota') ORDER BY e.created_at DESC, e.id DESC LIMIT 60`).all()
    .filter(e => ids.has(e.lead_id)).slice(0, 12);

  res.json({
    total: leads.length,
    funnel,
    conversao: leads.length ? fechados.length / leads.length : 0,
    taxaResposta: funnel[1].count ? funnel[2].count / funnel[1].count : 0,
    fechados: fechados.length,
    perdidos: perdidos.length,
    ativos: leads.filter(l => l.stage_max >= 1 && !['Fechado', 'Perdido'].includes(l.status)).length,
    pipeline: soma(negociando) + soma(fechados),
    pipelineAberto: soma(negociando),
    negociando: negociando.length,
    negociandoSemPlano: negociando.filter(l => !l.plano).length,
    receita: soma(fechados),
    mrr: fechados.filter(l => l.manutencao).length * MANUTENCAO_MENSAL,
    mudadosHoje: new Set(events.filter(e => e.tipo === 'status').map(e => e.lead_id)).size,
    tentativasHoje: events.filter(e => e.tipo === 'contato').length,
    canais,
    motivosPerda: group('motivo_perda', perdidos),
    porNicho: group('nicho'),
    porCidade: group('cidade'),
    porTipo: group('tipo_contato'),
    tarefasHoje: tasksOpen.filter(t => t.due_at >= agora),
    tarefasAtrasadas: tasksOpen.filter(t => t.due_at < agora),
    recentes,
  });
}));

// ---------- Importação ----------
app.post('/api/import/preview', upload.single('arquivo'), wrap(async (req, res) => {
  if (!req.file) throw new Error('Nenhum arquivo enviado');
  const name = req.file.originalname || '';
  const existing = new Map(db.prepare('SELECT tel_digits, status FROM leads').all().map(r => [r.tel_digits, r.status]));
  const descartados = new Set(db.prepare('SELECT tel_digits FROM descartados').all().map(r => r.tel_digits));
  let result;
  if (/\.json$/i.test(name) || req.file.mimetype === 'application/json') {
    result = parseJson(req.file.buffer.toString('utf8'));
    if (result.kind === 'status') return res.json({ kind: 'status', map: result.map, total: Object.keys(result.map).length });
  } else if (/\.xlsx$/i.test(name)) {
    result = { kind: 'leads', sheets: await parseXlsx(req.file.buffer, name) };
  } else {
    throw new Error('Formato não suportado — envie .xlsx (ou .json do CRM antigo)');
  }
  if (!result.sheets.length) throw new Error('Não achei nenhuma aba com coluna de telefone nessa planilha');
  for (const s of result.sheets) {
    s.semTelefone = s.rows.filter(r => !r.tel_digits).length;
    const repetidos = s.rows.filter(r => r.tel_digits && existing.has(r.tel_digits)).map(r => existing.get(r.tel_digits));
    s.jaExistem = repetidos.length;
    s.jaPerdidos = repetidos.filter(st => st === 'Perdido').length;
    s.jaEmAndamento = repetidos.filter(st => !['Novo', 'Perdido'].includes(st)).length;
    s.descartados = s.rows.filter(r => r.tel_digits && descartados.has(r.tel_digits)).length;
  }
  res.json({ kind: 'leads', filename: name, sheets: result.sheets });
}));

app.post('/api/import/commit', wrap((req, res) => {
  const { batches = [] } = req.body || {};
  const total = { criados: 0, atualizados: 0, ignorados: 0, descartados: 0 };
  for (const b of batches) {
    const r = upsertBatch(b.rows || [], {
      nicho: b.nicho?.trim(), cidade: b.cidade?.trim(), prioridade: b.prioridade || 'alta',
      forceNichoCidade: !!b.forceNichoCidade, origem: `Importado de ${b.origem || 'planilha'}`,
    });
    total.criados += r.criados; total.atualizados += r.atualizados; total.ignorados += r.ignorados; total.descartados += r.descartados;
  }
  res.json(total);
}));

app.post('/api/import/status', wrap((req, res) => {
  let map = req.body?.map;
  if (typeof map === 'string') map = JSON.parse(map);
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Cole o JSON no formato { "5511...": { "status": "...", "updatedAt": "..." } }');
  res.json(importStatusMap(map));
}));

app.get('/api/export', wrap((req, res) => {
  const dump = {
    exportadoEm: now(),
    leads: db.prepare('SELECT * FROM leads').all(),
    events: db.prepare('SELECT * FROM events').all(),
    tasks: db.prepare('SELECT * FROM tasks').all(),
  };
  res.setHeader('Content-Disposition', `attachment; filename="crm-jc-backup-${now().slice(0, 10)}.json"`);
  res.json(dump);
}));

// ---------- Frontend ----------
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0 }));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`CRM JC rodando em http://localhost:${PORT}`);
  if (!PASSWORD) console.log('⚠  Sem senha: defina CRM_PASSWORD antes de colocar na VPS.');
});
