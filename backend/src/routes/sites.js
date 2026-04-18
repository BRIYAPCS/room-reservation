import { Router } from 'express'
import pool from '../config/db.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js'

const router = Router()

// GET /api/sites
// Response: [{ id, code, name, image_url }]
router.get('/', async (req, res) => {
  try {
    const [sites] = await pool.query(
      `SELECT id, code, name, image_url
       FROM sites
       WHERE is_active = 1
       ORDER BY sort_order ASC, name ASC`
    )
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
    res.json(sites)
  } catch (err) {
    console.error('[sites] GET /:', err.message)
    res.status(500).json({ error: 'Failed to fetch sites' })
  }
})

// PUT /api/sites/reorder  (admin only)
// Body: [{ id, sort_order }, …]
router.put('/reorder', authMiddleware, requireSuperAdmin, async (req, res) => {
  const items = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Expected array of { id, sort_order }' })
  }
  try {
    await Promise.all(
      items.map(({ id, sort_order }) =>
        pool.query('UPDATE sites SET sort_order = ? WHERE id = ?', [sort_order, id])
      )
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[sites] PUT /reorder:', err.message)
    res.status(500).json({ error: 'Failed to save order' })
  }
})

// POST /api/sites  — create a new site (superadmin only)
// Body: { name, code? }
router.post('/', authMiddleware, requireSuperAdmin, async (req, res) => {
  const { name, code } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Site name is required' })

  try {
    const siteCode = code?.trim().toUpperCase() ||
      name.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').slice(0, 20)

    const [[existing]] = await pool.query('SELECT id FROM sites WHERE code = ?', [siteCode])
    if (existing) return res.status(409).json({ error: `Site code "${siteCode}" already exists` })

    const [[{ maxOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM sites'
    )

    const [result] = await pool.query(
      `INSERT INTO sites (name, code, sort_order, is_active) VALUES (?, ?, ?, 1)`,
      [name.trim(), siteCode, maxOrder + 1]
    )
    res.status(201).json({ id: result.insertId, name: name.trim(), code: siteCode, image_url: null })
  } catch (err) {
    console.error('[sites] POST /:', err.message)
    res.status(500).json({ error: 'Failed to create site' })
  }
})

// PUT /api/sites/:siteId  — update site info (superadmin only)
// Body: { name?, code? }
router.put('/:siteId', authMiddleware, requireSuperAdmin, async (req, res) => {
  const { name, code } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Site name is required' })

  try {
    const [[site]] = await pool.query(
      'SELECT id, code FROM sites WHERE id = ? AND is_active = 1',
      [req.params.siteId]
    )
    if (!site) return res.status(404).json({ error: 'Site not found' })

    const newCode = code?.trim().toUpperCase() || site.code

    // If code is changing, make sure it's not already taken by another site
    if (newCode !== site.code) {
      const [[conflict]] = await pool.query(
        'SELECT id FROM sites WHERE code = ? AND id != ?',
        [newCode, req.params.siteId]
      )
      if (conflict) return res.status(409).json({ error: `Site code "${newCode}" already exists` })
    }

    await pool.query(
      'UPDATE sites SET name = ?, code = ? WHERE id = ?',
      [name.trim(), newCode, req.params.siteId]
    )
    res.json({ ok: true, name: name.trim(), code: newCode })
  } catch (err) {
    console.error('[sites] PUT /:siteId:', err.message)
    res.status(500).json({ error: 'Failed to update site' })
  }
})

// DELETE /api/sites/:siteId  — soft-delete a site (superadmin only)
router.delete('/:siteId', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const [[site]] = await pool.query(
      'SELECT id FROM sites WHERE id = ? AND is_active = 1',
      [req.params.siteId]
    )
    if (!site) return res.status(404).json({ error: 'Site not found' })

    await pool.query('UPDATE sites SET is_active = 0 WHERE id = ?', [req.params.siteId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[sites] DELETE /:siteId:', err.message)
    res.status(500).json({ error: 'Failed to delete site' })
  }
})

// GET /api/sites/:siteCode
// Response: { id, code, name, rooms: [...] }
router.get('/:siteCode', async (req, res) => {
  try {
    const [[site]] = await pool.query(
      `SELECT id, code, name
       FROM sites
       WHERE code = ? AND is_active = 1`,
      [req.params.siteCode]
    )
    if (!site) return res.status(404).json({ error: 'Site not found' })

    const [rooms] = await pool.query(
      `SELECT r.id, r.name, r.room_code, r.capacity
       FROM rooms r
       JOIN sites s ON r.site_id = s.id
       WHERE s.code = ? AND r.is_active = 1
       ORDER BY r.sort_order ASC, r.name ASC`,
      [req.params.siteCode]
    )
    res.json({ ...site, rooms })
  } catch (err) {
    console.error('[sites] GET /:siteCode:', err.message)
    res.status(500).json({ error: 'Failed to fetch site' })
  }
})

// GET /api/sites/:siteCode/rooms/:roomId
// Response: { id, name, room_code, capacity }
router.get('/:siteCode/rooms/:roomId', async (req, res) => {
  try {
    const { siteCode, roomId } = req.params
    const [[room]] = await pool.query(
      `SELECT r.id, r.name, r.room_code, r.capacity
       FROM rooms r
       JOIN sites s ON r.site_id = s.id
       WHERE s.code = ? AND r.id = ? AND r.is_active = 1`,
      [siteCode, roomId]
    )
    if (!room) return res.status(404).json({ error: 'Room not found' })
    res.json(room)
  } catch (err) {
    console.error('[sites] GET /:siteCode/rooms/:roomId:', err.message)
    res.status(500).json({ error: 'Failed to fetch room' })
  }
})

export default router
