import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    20,      // 20 per process; PM2 cluster adds more per worker
  queueLimit:         50,      // queue up to 50 requests before rejecting
  idleTimeout:        60_000,  // release idle connections after 60 s
  enableKeepAlive:    true,    // send TCP keep-alives to prevent firewall drops
  keepAliveInitialDelay: 10_000,
  timezone:           '+00:00',          // UTC — APP_TIMEZONE in .env handles display conversion
  dateStrings:        true,              // return DATETIME as plain strings — no JS timezone conversion
})

export default pool
