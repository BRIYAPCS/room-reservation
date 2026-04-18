import { Router } from 'express'
import pool from '../config/db.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { authMiddleware, requireAuth } from '../middleware/authMiddleware.js'

const router = Router()

// GET /api/reservations/:siteCode/:roomId?from=ISO&to=ISO
// from/to are optional — omit for all reservations, provide for a visible date range
// Response: FullCalendar-compatible event array
router.get('/:siteCode/:roomId', authMiddleware, async (req, res) => {
  try {
    const { siteCode, roomId } = req.params
    const { from, to } = req.query

    // Validate that the room belongs to the site before returning any data
    const [[room]] = await pool.query(
      `SELECT r.id FROM rooms r
       JOIN sites s ON r.site_id = s.id
       WHERE s.code = ? AND r.id = ?`,
      [siteCode, roomId]
    )
    if (!room) return res.status(404).json({ error: 'Room not found for this site' })

    let sql = `
      SELECT
        res.id,
        res.title,
        res.description,
        res.start_time,
        res.end_time,
        res.created_by_name,
        res.recurrence_group_id,
        res.recurrence_index,
        res.all_day,
        res.owner_email,
        res.ownership_type,
        res.created_device_session_id,
        res.last_verified_edit_at,
        res.last_verified_edit_email
      FROM reservations res
      JOIN sites s ON res.site_id = s.id
      WHERE s.code = ?
        AND res.room_id = ?`

    const params = [siteCode, roomId]

    // Optional date-range filter: returns events that overlap the window
    if (from && to) {
      sql += `\n        AND res.start_time < ?\n        AND res.end_time   > ?`
      params.push(to, from)
    }

    sql += '\n      ORDER BY res.start_time'

    const [rows] = await pool.query(sql, params)

    const events = rows.map(r => ({
      id:              r.id,
      title:           r.title,
      start:           r.start_time.replace(' ', 'T'),
      end:             r.end_time.replace(' ', 'T'),
      backgroundColor: '#4abfce',
      borderColor:     '#3aaebe',
      extendedProps: {
        bookedBy:                r.created_by_name,
        description:             r.description || '',
        recurrenceGroupId:       r.recurrence_group_id || null,
        recurrenceIndex:         r.recurrence_index    ?? null,
        allDay:                  !!r.all_day,
        ownerEmail:              r.owner_email                || null,
        ownershipType:           r.ownership_type             || null,
        createdDeviceSessionId:  r.created_device_session_id  || null,
        lastVerifiedEditAt:      r.last_verified_edit_at       || null,
        lastVerifiedEditEmail:   r.last_verified_edit_email    || null,
      },
    }))

    res.json(events)
  } catch (err) {
    console.error('[reservations] GET /:siteCode/:roomId:', err.message)
    res.status(500).json({ error: 'Failed to fetch reservations' })
  }
})

export default router
