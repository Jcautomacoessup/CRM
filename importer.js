// Leitura das planilhas do scraper (.xlsx) e de JSON exportado do CRM antigo.
const ExcelJS = require('exceljs');
const { db, normalizePhone, inferRedeTipo, STATUSES, stageOf, addEvent, now } = require('./db');

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Cabeçalho normalizado -> campo. A primeira regra que bater vence.
const COLUMN_RULES = [
  ['wa_link_col', h => h.includes('linkwhatsapp')],
  ['telefone', h => h.includes('telefone') || h === 'whatsapp'],
  ['qtd', h => h.includes('qtd')],
  ['estrelas', h => h.includes('estrela') || h.includes('avaliacao') || h === 'nota'],
  ['nome', h => h.includes('nome')],
  ['categoria', h => h.includes('categoria')],
  ['tipo_contato', h => h.includes('tipodecontato') || h === 'tipocontato'],
  ['rede_tipo', h => h.includes('tipoderede')],
  ['rede_link', h => h.includes('redesocial') || h === 'site'],
  ['endereco', h => h.includes('endereco')],
  ['maps_link', h => h.includes('maps')],
  ['busca_origem', h => h.includes('buscadeorigem')],
  ['motivo_exclusao', h => h.includes('motivodeexclusao')],
  ['franquia', h => h.includes('franquia')],
  ['obs', h => h.includes('observ')],
  ['mensagem', h => h === 'mensagem' || h.includes('mensagemdeabordagem')],
  ['nicho', h => h === 'nicho'],
  ['cidade', h => h === 'cidade'],
  ['prioridade', h => h === 'prioridade'],
  ['status', h => h === 'status'],
];

function mapHeader(header) {
  const h = norm(header);
  if (!h) return null;
  const rule = COLUMN_RULES.find(([, test]) => test(h));
  return rule ? rule[0] : null;
}

// remove os ícones do Google Maps (área de uso privado do Unicode) que vêm colados no endereço/telefone
function cellText(v) { return rawCellText(v).replace(/[\uE000-\uF8FF]/g, '').replace(/[ \t]+/g, ' ').trim(); }
function rawCellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString();
    if (v.richText) return v.richText.map(r => r.text).join('');
    if (v.text != null) return typeof v.text === 'object' ? rawCellText(v.text) : String(v.text);
    if (v.hyperlink) return v.hyperlink;
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(v).trim();
}

const titleCase = s => s.replace(/\s+/g, ' ').trim().replace(/(^|\s)(\p{L})/gu, (m, sp, c) => sp + c.toUpperCase());

// "busca_pousada_em_Ubatuba_2026-09-27_0120.xlsx" -> { nicho: "Pousada", cidade: "Ubatuba" }
function inferFromText(text) {
  if (!text) return {};
  let s = String(text).replace(/\.(xlsx|xls|json)$/i, '').replace(/_\d{4}-\d{2}-\d{2}.*$/, '')
    .replace(/^busca[_\s-]+/i, '').replace(/[_-]+/g, ' ').trim();
  const m = s.match(/^(.*?)\s+em\s+(.+)$/i);
  if (m) return { nicho: titleCase(m[1]), cidade: titleCase(m[2]) };
  const parts = s.split(' ');
  if (parts.length >= 2) return { nicho: titleCase(parts[0]), cidade: titleCase(parts[parts.length - 1]) };
  return {};
}

function mostCommon(values) {
  const c = {};
  values.filter(Boolean).forEach(v => (c[v] = (c[v] || 0) + 1));
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function messageFromWaLink(link) {
  const m = String(link || '').match(/[?&]text=([^&]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch { return ''; }
}

// "..., Ubatuba - SP, 11680-000" -> "Ubatuba"
function cityFromAddress(addr) {
  const seg = String(addr || '').split(',').map(x => x.trim()).reverse().find(x => /^.+?\s-\s[A-Z]{2}$/.test(x));
  return seg ? seg.replace(/\s-\s[A-Z]{2}$/, '').trim() : '';
}

function finishRow(r) {
  r = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? cellText(v) : v]));
  const tel = normalizePhone(r.telefone || r.tel_digits);
  const rede_link = r.rede_link && /^https?:|www\.|\.com/i.test(r.rede_link) ? r.rede_link : (r.rede_link || null);
  let prioridade = ['alta', 'baixa', 'revisar'].includes(String(r.prioridade || '').toLowerCase())
    ? r.prioridade.toLowerCase() : null;
  let obs = r.obs || '';
  if (r.motivo_exclusao) {
    prioridade = prioridade || 'revisar';
    obs = [obs, `Motivo de exclusão (planilha): ${r.motivo_exclusao}`].filter(Boolean).join(' · ');
  }
  if (String(r.franquia || '').toLowerCase() === 'sim') {
    prioridade = prioridade || 'baixa';
    obs = [obs, 'Franquia'].filter(Boolean).join(' · ');
  }
  const statusMatch = STATUSES.find(s => norm(s) === norm(r.status));
  return {
    tel_digits: tel,
    nome: r.nome || '',
    telefone: r.telefone || '',
    estrelas: r.estrelas ? String(r.estrelas).replace(',', '.') : '',
    categoria: r.categoria || '',
    endereco: r.endereco || '',
    tipo_contato: r.tipo_contato || (rede_link ? 'Rede Social' : 'Sem site'),
    rede_link: rede_link || '',
    rede_tipo: (r.rede_tipo && ['instagram', 'facebook', 'linkedin', 'linktree', 'wa_disguised', 'outro'].includes(r.rede_tipo.toLowerCase())
      ? r.rede_tipo.toLowerCase() : inferRedeTipo(rede_link)) || '',
    maps_link: r.maps_link || '',
    mensagem: r.mensagem || messageFromWaLink(r.wa_link_col) || '',
    obs,
    nicho: r.nicho || inferFromText(r.busca_origem).nicho || '',
    cidade: r.cidade || cityFromAddress(r.endereco) || inferFromText(r.busca_origem).cidade || '',
    prioridade: prioridade || '',
    status: statusMatch || '',
    status_updated_at: r.status_updated_at || '',
  };
}

async function parseXlsx(buffer, filename) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const fromFile = inferFromText(filename);
  const sheets = [];
  wb.eachSheet(ws => {
    const headerRow = ws.getRow(1);
    const columns = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const header = cellText(cell.value);
      columns.push({ col, header, field: mapHeader(header) });
    });
    if (!columns.some(c => c.field === 'telefone')) return;
    const rows = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const r = {};
      for (const c of columns) {
        if (!c.field) continue;
        const cell = row.getCell(c.col);
        let val = cellText(cell.value);
        if ((c.field === 'rede_link' || c.field === 'maps_link' || c.field === 'wa_link_col') && cell.hyperlink) val = cell.hyperlink;
        if (val && !r[c.field]) r[c.field] = val;
      }
      if (Object.keys(r).length) rows.push(r);
    });
    const origem = inferFromText(mostCommon(rows.map(r => r.busca_origem)));
    const fromSheet = /^(sheet|planilha|aba)\s*\d*$/i.test(ws.name) ? {} : inferFromText(ws.name);
    const finished = rows.map(finishRow);
    sheets.push({
      name: ws.name,
      columns: columns.map(c => ({ header: c.header, field: c.field })),
      suggestion: {
        nicho: mostCommon(finished.map(r => r.nicho)) || origem.nicho || fromFile.nicho || fromSheet.nicho || '',
        cidade: mostCommon(finished.map(r => r.cidade)) || origem.cidade || fromFile.cidade || fromSheet.cidade || '',
      },
      rows: finished,
    });
  });
  return sheets;
}

// JSON do CRM antigo: array de leads (camelCase) ou mapa { telDigits: {status, updatedAt} }.
function parseJson(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) {
    const rows = data.map(l => finishRow({
      telefone: l.telefone || l.telDigits, tel_digits: l.telDigits, nome: l.nome, estrelas: l.estrelas,
      categoria: l.categoria, endereco: l.endereco, tipo_contato: l.tipoContato, rede_link: l.redeLink,
      rede_tipo: l.redeTipo, maps_link: l.mapsLink, mensagem: l.mensagem, obs: l.obs, nicho: l.nicho,
      cidade: l.cidade, prioridade: l.prioridade, status: l.status, status_updated_at: l.updatedAt,
    }));
    return { kind: 'leads', sheets: [{ name: 'JSON', columns: [], suggestion: { nicho: '', cidade: '' }, rows }] };
  }
  if (data && typeof data === 'object') return { kind: 'status', map: data };
  throw new Error('JSON em formato não reconhecido');
}

const upsertBatch = db.transaction((rows, opts) => {
  const ts = now();
  const res = { criados: 0, atualizados: 0, ignorados: 0, descartados: 0 };
  const isDescartado = db.prepare('SELECT 1 FROM descartados WHERE tel_digits = ?');
  const find = db.prepare('SELECT * FROM leads WHERE tel_digits = ?');
  const insert = db.prepare(`INSERT INTO leads (tel_digits, nome, telefone, estrelas, categoria, endereco, tipo_contato,
    rede_link, rede_tipo, maps_link, mensagem, obs, nicho, cidade, prioridade, status, stage_max, status_updated_at, created_at, updated_at)
    VALUES (@tel_digits, @nome, @telefone, @estrelas, @categoria, @endereco, @tipo_contato, @rede_link, @rede_tipo, @maps_link,
    @mensagem, @obs, @nicho, @cidade, @prioridade, @status, @stage_max, @status_updated_at, @created_at, @updated_at)`);
  const keep = (novo, velho) => (novo != null && novo !== '' ? novo : velho);
  for (const raw of rows) {
    const tel = normalizePhone(raw.tel_digits || raw.telefone);
    if (!tel) { res.ignorados++; continue; }
    if (isDescartado.get(tel)) { res.descartados++; continue; }
    const r = { ...raw, tel_digits: tel };
    // planilha = 1 nicho por lote: o nicho escolhido vale pra todas as linhas; a cidade vem do endereço quando der
    if (opts.nicho) r.nicho = opts.nicho;
    if (opts.cidade && !r.cidade) r.cidade = opts.cidade;
    const old = find.get(tel);
    if (old) {
      db.prepare(`UPDATE leads SET nome=@nome, telefone=@telefone, estrelas=@estrelas, categoria=@categoria, endereco=@endereco,
        tipo_contato=@tipo_contato, rede_link=@rede_link, rede_tipo=@rede_tipo, maps_link=@maps_link, mensagem=@mensagem, obs=@obs,
        nicho=@nicho, cidade=@cidade, updated_at=@updated_at WHERE id=@id`).run({
        id: old.id, nome: keep(r.nome, old.nome), telefone: keep(r.telefone, old.telefone), estrelas: keep(r.estrelas, old.estrelas),
        categoria: keep(r.categoria, old.categoria), endereco: keep(r.endereco, old.endereco), tipo_contato: keep(r.tipo_contato, old.tipo_contato),
        rede_link: keep(r.rede_link, old.rede_link), rede_tipo: keep(r.rede_tipo, old.rede_tipo), maps_link: keep(r.maps_link, old.maps_link),
        mensagem: old.mensagem || r.mensagem || null, obs: old.obs || r.obs || null,
        nicho: opts.forceNichoCidade ? keep(r.nicho, old.nicho) : keep(old.nicho, r.nicho),
        cidade: opts.forceNichoCidade ? keep(r.cidade, old.cidade) : keep(old.cidade, r.cidade), updated_at: ts,
      });
      res.atualizados++;
    } else {
      const status = r.status || 'Novo';
      const statusAt = r.status_updated_at || (status !== 'Novo' ? ts : null);
      const info = insert.run({
        tel_digits: tel, nome: r.nome || '(sem nome)', telefone: r.telefone || null, estrelas: r.estrelas || null,
        categoria: r.categoria || null, endereco: r.endereco || null, tipo_contato: r.tipo_contato || null,
        rede_link: r.rede_link || null, rede_tipo: r.rede_tipo || null, maps_link: r.maps_link || null,
        mensagem: r.mensagem || null, obs: r.obs || null, nicho: r.nicho || null, cidade: r.cidade || null,
        prioridade: r.prioridade || opts.prioridade || 'alta', status,
        stage_max: status === 'Perdido' ? 1 : Math.max(0, stageOf(status)), status_updated_at: statusAt,
        created_at: ts, updated_at: ts,
      });
      addEvent({ lead_id: info.lastInsertRowid, tipo: 'import', detalhe: opts.origem || 'Importado', created_at: ts });
      if (status !== 'Novo') {
        addEvent({ lead_id: info.lastInsertRowid, tipo: 'status', de: 'Novo', para: status, detalhe: 'Status trazido da importação', created_at: statusAt });
      }
      res.criados++;
    }
  }
  return res;
});

// Migração dos status salvos no localStorage do CRM antigo.
const importStatusMap = db.transaction(map => {
  const res = { aplicados: 0, naoEncontrados: 0, invalidos: 0, naoEncontradosIds: [] };
  for (const [id, val] of Object.entries(map)) {
    const status = STATUSES.find(s => norm(s) === norm(val?.status ?? val));
    if (!status) { res.invalidos++; continue; }
    const lead = db.prepare('SELECT * FROM leads WHERE tel_digits = ?').get(normalizePhone(id));
    if (!lead) { res.naoEncontrados++; if (res.naoEncontradosIds.length < 30) res.naoEncontradosIds.push(id); continue; }
    const at = val?.updatedAt ? new Date(val.updatedAt).toISOString() : now();
    const stageMax = status === 'Perdido' ? Math.max(lead.stage_max, 1) : Math.max(lead.stage_max, stageOf(status));
    db.prepare(`UPDATE leads SET status=?, stage_max=?, status_updated_at=?, updated_at=?,
      motivo_perda = CASE WHEN ?='Perdido' THEN COALESCE(motivo_perda,'Outro') ELSE motivo_perda END WHERE id=?`)
      .run(status, stageMax, at, now(), status, lead.id);
    if (lead.status !== status) {
      addEvent({ lead_id: lead.id, tipo: 'status', de: lead.status, para: status, detalhe: 'Migrado do CRM antigo', created_at: at });
    }
    res.aplicados++;
  }
  return res;
});

module.exports = { parseXlsx, parseJson, upsertBatch, importStatusMap, inferFromText };
