# CRM de Prospecção — JC Automações

Node.js + Express + SQLite. Um processo, uma porta: API e telas juntas. O banco fica em `data/crm.db`.

## Rodar no computador

```bash
npm install
npm start
```

Abre em http://localhost:3000. Sem `CRM_PASSWORD` definido, entra direto (ok só no computador).

## O que tem

- **Dashboard**: funil (% acumulado + % por etapa), conversão geral, valor de pipeline, receita ganha,
  mudados hoje, conversão WhatsApp × Ligação, motivos de perda, leads por nicho/cidade/presença online,
  tarefas de hoje/atrasadas. Filtros por nicho, cidade, canal e período.
- **Leads**: busca + filtros, chips por status, cards com Copiar telefone / WhatsApp / Ligar / Copiar msg /
  Perfil / Maps e seletor de status. Depois de abrir o WhatsApp ou ligar, aparece um aviso pra registrar a
  tentativa em 1 clique.
- **Detalhe do lead**: dados editáveis, mensagem de abordagem (editável), registro de contato por canal
  (WhatsApp 1, Ligação 2…), notas, histórico completo e tarefas com vencimento.
- **Importar**: `.xlsx` do Lead Bot (uma ou várias abas). Telefone = chave única; lead repetido é
  atualizado, sem perder status/mensagem/obs. Também migra o status do CRM antigo (localStorage).
- **Backup**: botão em Importar → baixa tudo em JSON.

## Regras do funil

Novo → Contatado → Respondeu → Responsável confirmado → Prévia enviada (`Forte Lead`) → Negociando → Fechado.
`Perdido` sai da escada e guarda o motivo. O funil conta quantos leads **chegaram** a cada etapa (pular etapa
conta como ter passado por ela). Valor: LP R$400, site R$800 à vista / R$1.000 parcelado; sem plano definido
conta R$400. Manutenção soma R$100/mês à parte.

## Colocar na VPS (Hostinger, Ubuntu)

```bash
# 1. Node 20+ e PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx
sudo npm i -g pm2

# 2. Enviar a pasta (sem node_modules e sem data/) e instalar
cd /var/www/crm-jc && npm install --omit=dev

# 3. Editar a senha em ecosystem.config.js e subir
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

Nginx (`/etc/nginx/sites-available/crm`):

```nginx
server {
  server_name crm.seudominio.com.br;
  client_max_body_size 30m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Depois: `sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/ && sudo nginx -s reload`
e SSL com `sudo certbot --nginx -d crm.seudominio.com.br`.

**Backup na VPS:** copiar `data/crm.db` (ou usar o botão Backup). Pra levar os dados do computador pra VPS,
é só copiar o `data/crm.db` junto.
