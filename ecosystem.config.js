// PM2: pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [{
    name: 'crm-jc',
    script: 'server.js',
    env: {
      PORT: 3000,
      CRM_PASSWORD: 'troque-esta-senha',
      // DATA_DIR: '/var/lib/crm-jc', // opcional: onde fica o crm.db
    },
  }],
};
