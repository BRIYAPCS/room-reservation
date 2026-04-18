import { readFileSync } from 'fs'
import { parse } from 'dotenv'
import { resolve } from 'path'

/**
 * Reads a key directly from the .env file on disk each time it is called.
 * This allows toggling values like WEATHER_ENABLED without restarting the server.
 * Falls back to process.env if the file cannot be read.
 */
export function readEnv(key) {
  try {
    const envPath = resolve(process.cwd(), '.env')
    const parsed  = parse(readFileSync(envPath, 'utf8'))
    return Object.prototype.hasOwnProperty.call(parsed, key) ? parsed[key] : (process.env[key] ?? '')
  } catch {
    return process.env[key] ?? ''
  }
}
