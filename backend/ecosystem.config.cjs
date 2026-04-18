/**
 * PM2 ecosystem config — used on the Linode production server.
 *
 * Deploy steps (on Linode):
 *   npm install -g pm2
 *   cd /var/www/briya-api
 *   npm install --omit=dev
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save            ← persist across reboots
 *   pm2 startup         ← generate & run the systemd unit
 *
 * Useful commands:
 *   pm2 logs briya-api          — tail logs
 *   pm2 reload briya-api        — zero-downtime reload
 *   pm2 monit                   — live dashboard
 */
module.exports = {
  apps: [
    {
      name: 'briya-api',
      script: 'src/server.js',

      // Use 'cluster' mode with 2 workers (good for a 1-2 vCPU Linode).
      // Set to 'max' to use all available CPUs.
      instances: 2,
      exec_mode: 'cluster',

      // Restart if memory exceeds 300 MB
      max_memory_restart: '300M',

      // Auto-restart on crashes with exponential back-off
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Log rotation
      error_file: '/var/log/briya-api/error.log',
      out_file:   '/var/log/briya-api/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },

      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
}
