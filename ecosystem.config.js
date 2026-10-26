module.exports = {
  apps: [
    {
      name: 'matinee-api',
      cwd: __dirname + '/server',
      script: 'src/index.js',
      env: { NODE_ENV: 'production' },
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
  ],
};
