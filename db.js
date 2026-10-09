// Banco SQLite em arquivo + regras do funil.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'crm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tel_digits TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT '',
  telefone TEXT,
  estrelas TEXT,
  categoria TEXT,
  endereco TEXT,
  tipo_contato TEXT,
  rede_link TEXT,
  rede_tipo TEXT,
  maps_link TEXT,
  mensagem TEXT,
  obs TEXT,
  nicho TEXT,
  cidade TEXT,
  prioridade TEXT NOT NULL DEFAULT 'alta',
  status TEXT NOT NULL DEFAULT 'Novo',
  stage_max INTEGER NOT NULL DEFAULT 0,
  motivo_perda TEXT,
  plano TEXT,
  manutencao INTEGER NOT NULL DEFAULT 0,
  canal_preferido TEXT NOT NULL DEFAULT 'whatsapp',
  canal TEXT,
  status_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_nicho ON leads(nicho);
CREATE INDEX IF NOT EXISTS idx_leads_cidade ON leads(cidade);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,          -- status | contato | nota | import
  de TEXT,
  para TEXT,
  canal TEXT,                  -- whatsapp | ligacao
  resultado TEXT,
  detalhe TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_lead ON events(lead_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  due_at TEXT,
  done_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);

-- telefones de leads excluídos: importações futuras pulam esses números
CREATE TABLE IF NOT EXISTS descartados (
  tel_digits TEXT PRIMARY KEY,
  nome TEXT,
  created_at TEXT NOT NULL
);
`);

// Colunas acrescentadas depois da primeira versão
if (!db.prepare("SELECT 1 FROM pragma_table_info('leads') WHERE name = 'valor_fechado'").get()) {
  db.exec('ALTER TABLE leads ADD COLUMN valor_fechado INTEGER'); // valor negociado de fato (sobrepõe o do plano)
}

// Limpeza única: ícones do Google Maps (área de uso privado do Unicode) que vieram colados nos dados.
{
  const PUA = /[\uE000-\uF8FF]/g;
  const cols = ['nome', 'telefone', 'endereco', 'categoria', 'obs'];
  const sujos = db.prepare(`SELECT id, ${cols.join(', ')} FROM leads`).all().filter(l => cols.some(c => /[\uE000-\uF8FF]/.test(l[c] || '')));
  const upd = db.prepare(`UPDATE leads SET ${cols.map(c => `${c} = @${c}`).join(', ')} WHERE id = @id`);
  db.transaction(() => sujos.forEach(l => {
    cols.forEach(c => { if (l[c]) l[c] = l[c].replace(PUA, '').replace(/\s+/g, ' ').trim(); });
    upd.run(l);
  }))();
}

// Etapas do funil, na ordem. "Perdido" fica fora da escada (stage -1).
const STAGES = [
  { status: 'Novo', label: 'Leads' },
  { status: 'Contatado', label: 'Contato tentado' },
  { status: 'Respondeu', label: 'Atendeu / Respondeu' },
  { status: 'Responsável confirmado', label: 'Responsável confirmado' },
  { status: 'Forte Lead', label: 'Prévia / oferta enviada' },
  { status: 'Negociando', label: 'Negociando' },
  { status: 'Fechado', label: 'Fechado' },
];
const STATUSES = [...STAGES.map(s => s.status), 'Perdido'];
const stageOf = status => STAGES.findIndex(s => s.status === status);

const PLANOS = {
  lp: { label: 'Landing page', valor: 400 },
  site_vista: { label: 'Site completo (à vista)', valor: 800 },
  site_parcelado: { label: 'Site completo (parcelado)', valor: 1000 },
};
const VALOR_PADRAO = 400; // estimativa quando o plano ainda não foi definido
const MANUTENCAO_MENSAL = 100;

const MOTIVOS_PERDA = [
  'Preço',
  'Já tem site / resolveu com outra empresa',
  'Parou de responder',
  'Não é prioridade agora',
  'Fora do perfil / nicho errado',
  'Outro',
];

const RESULTADOS = {
  whatsapp: ['Mensagem enviada', 'Já tinha conversado antes', 'Sem resposta', 'Respondeu', 'Número sem WhatsApp'],
  ligacao: ['Não atendeu', 'Atendeu', 'Caixa postal', 'Pediu pra ligar depois', 'Número errado'],
};

const now = () => new Date().toISOString();

function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length < 12) return '';
  return d;
}

function inferRedeTipo(link) {
  if (!link) return null;
  const l = String(link).toLowerCase();
  if (l.includes('instagram.com')) return 'instagram';
  if (l.includes('facebook.com') || l.includes('fb.com')) return 'facebook';
  if (l.includes('linkedin.com')) return 'linkedin';
  if (l.includes('linktr.ee')) return 'linktree';
  if (l.includes('wa.me') || l.includes('whatsapp.com')) return 'wa_disguised';
  return 'outro';
}

function waLink(lead) {
  const base = `https://wa.me/${lead.tel_digits}`;
  return lead.mensagem ? `${base}?text=${encodeURIComponent(lead.mensagem)}` : base;
}

function leadValor(lead) {
  if (lead.valor_fechado != null) return lead.valor_fechado;
  return PLANOS[lead.plano]?.valor ?? VALOR_PADRAO;
}

function decorate(lead) {
  if (!lead) return lead;
  return { ...lead, wa_link: waLink(lead), valor: leadValor(lead) };
}

const insEvent = db.prepare(`INSERT INTO events (lead_id, tipo, de, para, canal, resultado, detalhe, created_at)
  VALUES (@lead_id, @tipo, @de, @para, @canal, @resultado, @detalhe, @created_at)`);

function addEvent(e) {
  return insEvent.run({ de: null, para: null, canal: null, resultado: null, detalhe: null, created_at: now(), ...e });
}

// Troca de status centralizada: atualiza o lead, o estágio máximo atingido e registra no histórico.
const changeStatus = db.transaction((leadId, novo, extra = {}) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  if (!lead) throw new Error('Lead não encontrado');
  if (!STATUSES.includes(novo)) throw new Error('Status inválido');
  const ts = extra.at || now();
  const stage = stageOf(novo);
  const stageMax = novo === 'Perdido' ? Math.max(lead.stage_max, 1) : Math.max(lead.stage_max, stage);
  const fields = {
    status: novo,
    stage_max: stageMax,
    status_updated_at: ts,
    updated_at: now(),
    motivo_perda: novo === 'Perdido' ? (extra.motivo_perda || lead.motivo_perda || 'Outro') : null,
    plano: extra.plano !== undefined ? extra.plano || null : lead.plano,
    manutencao: extra.manutencao !== undefined ? (extra.manutencao ? 1 : 0) : lead.manutencao,
  };
  db.prepare(`UPDATE leads SET status=@status, stage_max=@stage_max, status_updated_at=@status_updated_at,
    updated_at=@updated_at, motivo_perda=@motivo_perda, plano=@plano, manutencao=@manutencao WHERE id=@id`)
    .run({ ...fields, id: leadId });
  if (lead.status !== novo) {
    let detalhe = extra.detalhe || null;
    if (novo === 'Perdido') detalhe = `Motivo: ${fields.motivo_perda}` + (detalhe ? ` — ${detalhe}` : '');
    if (novo === 'Fechado' && fields.plano) {
      detalhe = `${PLANOS[fields.plano].label}${fields.manutencao ? ' + manutenção' : ''}` + (detalhe ? ` — ${detalhe}` : '');
    }
    addEvent({ lead_id: leadId, tipo: 'status', de: lead.status, para: novo, detalhe, created_at: ts });
  }
  return decorate(db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId));
});

// Tentativa de contato: registra o canal; se o lead ainda era "Novo", passa pra "Contatado".
const logContato = db.transaction((leadId, { canal, resultado, detalhe }) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  if (!lead) throw new Error('Lead não encontrado');
  if (!RESULTADOS[canal]) throw new Error('Canal inválido');
  addEvent({ lead_id: leadId, tipo: 'contato', canal, resultado: resultado || null, detalhe: detalhe || null });
  if (!lead.canal) db.prepare('UPDATE leads SET canal = ?, updated_at = ? WHERE id = ?').run(canal, now(), leadId);
  if (lead.status === 'Novo') changeStatus(leadId, 'Contatado');
  return decorate(db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId));
});

module.exports = {
  db, STAGES, STATUSES, PLANOS, VALOR_PADRAO, MANUTENCAO_MENSAL, MOTIVOS_PERDA, RESULTADOS,
  stageOf, normalizePhone, inferRedeTipo, decorate, addEvent, changeStatus, logContato, now, leadValor, DATA_DIR,
};
