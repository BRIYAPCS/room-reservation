import { Router } from 'express'
import pool from '../config/db.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js'

const router = Router()

// GET /api/rooms/:siteCode  — public read (no auth required to browse)
// Response: [{ id, name, room_code, capacity, image_url }]
router.get('/:siteCode', async (req, res) => {
  try {
    const [rooms] = await pool.query(
      `SELECT r.id, r.name, r.room_code, r.capacity, r.image_url
       FROM rooms r
       JOIN sites s ON r.site_id = s.id
       WHERE s.code = ? AND r.is_active = 1
       ORDER BY r.sort_order ASC, r.name ASC`,
      [req.params.siteCode]
    )
    if (!rooms.length) return res.status(404).json({ error: 'No rooms found for this site' })
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
    res.json(rooms)
  } catch (err) {
    console.error('[rooms] GET /:siteCode:', err.message)
    res.status(500).json({ error: 'Failed to fetch rooms' })
  }
})

// POST /api/rooms/:siteCode  — create a new room (superadmin only)
// Body: { name, room_code?, capacity? }
router.post('/:siteCode', authMiddleware, requireSuperAdmin, async (req, res) => {
  const { name, room_code, capacity } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Room name is required' })

  try {
    const [[site]] = await pool.query(
      'SELECT id FROM sites WHERE code = ? AND is_active = 1',
      [req.params.siteCode]
    )
    if (!site) return res.status(404).json({ error: 'Site not found' })

    const [[{ maxOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM rooms WHERE site_id = ?',
      [site.id]
    )

    // Generate a clean room code: uppercase, underscores only, no special chars
    let baseCode = (
      room_code?.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '') ||
      name.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
    ).slice(0, 20) || 'ROOM'

    // Auto-suffix if this code already exists within the same site
    let code = baseCode
    let suffix = 2
    while (true) {
      const [[existing]] = await pool.query(
        'SELECT id FROM rooms WHERE room_code = ? AND site_id = ?',
        [code, site.id]
      )
      if (!existing) break
      code = baseCode.slice(0, 17) + '_' + suffix
      suffix++
    }

    const cap = parseInt(capacity, 10) || 0

    const [result] = await pool.query(
      `INSERT INTO rooms (site_id, name, room_code, capacity, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [site.id, name.trim(), code, cap, maxOrder + 1]
    )
    res.status(201).json({ id: result.insertId, name: name.trim(), room_code: code, capacity: cap })
  } catch (err) {
    console.error('[rooms] POST /:siteCode:', err.message)
    res.status(500).json({ error: 'Failed to create room' })
  }
})

// PUT /api/rooms/reorder/:siteCode  — reorder rooms (superadmin only)
// IMPORTANT: must be defined BEFORE /:siteCode/:roomId so Express doesn't swallow it
// Body: [{ id, sort_order }, …]
router.put('/reorder/:siteCode', authMiddleware, requireSuperAdmin, async (req, res) => {
  const items = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Expected array of { id, sort_order }' })
  }
  try {
    await Promise.all(
      items.map(({ id, sort_order }) =>
        pool.query('UPDATE rooms SET sort_order = ? WHERE id = ?', [sort_order, id])
      )
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[rooms] PUT /reorder:', err.message)
    res.status(500).json({ error: 'Failed to save order' })
  }
})

// PUT /api/rooms/:siteCode/:roomId  — update room info (superadmin only)
// Body: { name?, capacity? }
router.put('/:siteCode/:roomId', authMiddleware, requireSuperAdmin, async (req, res) => {
  const { name, capacity } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Room name is required' })

  try {
    const [[room]] = await pool.query(
      `SELECT r.id FROM rooms r
       JOIN sites s ON r.site_id = s.id
       WHERE s.code = ? AND r.id = ? AND r.is_active = 1`,
      [req.params.siteCode, req.params.roomId]
    )
    if (!room) return res.status(404).json({ error: 'Room not found' })

    const cap = parseInt(capacity, 10)
    await pool.query(
      'UPDATE rooms SET name = ?, capacity = ? WHERE id = ?',
      [name.trim(), isNaN(cap) || cap < 0 ? 0 : cap, req.params.roomId]
    )
    res.json({ ok: true, name: name.trim(), capacity: cap || 0 })
  } catch (err) {
    console.error('[rooms] PUT /:siteCode/:roomId:', err.message)
    res.status(500).json({ error: 'Failed to update room' })
  }
})

// DELETE /api/rooms/:siteCode/:roomId  — soft-delete a room (superadmin only)
router.delete('/:siteCode/:roomId', authMiddleware, requireSuperAdmin, async (req, res) => {
  const { siteCode, roomId } = req.params
  try {
    const [[room]] = await pool.query(
      `SELECT r.id FROM rooms r
       JOIN sites s ON r.site_id = s.id
       WHERE s.code = ? AND r.id = ? AND r.is_active = 1`,
      [siteCode, roomId]
    )
    if (!room) return res.status(404).json({ error: 'Room not found' })

    await pool.query('UPDATE rooms SET is_active = 0 WHERE id = ?', [roomId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[rooms] DELETE /:siteCode/:roomId:', err.message)
    res.status(500).json({ error: 'Failed to delete room' })
  }
})

export default router
