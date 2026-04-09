import { useState, useEffect, useMemo } from 'react'
import './EditBookingModal.css'
import { useConfig } from '../context/ConfigContext'
import RichTextEditor from './RichTextEditor'

function buildTimeOptions(startHour, endHour, slotMins) {
  const options = []
  for (let t = startHour * 60; t <= endHour * 60; t += slotMins) {
    const h = Math.floor(t / 60)
    const m = t % 60
    if (h === endHour && m > 0) break
    const hour12 = h % 12 === 0 ? 12 : h % 12
    const ampm   = h < 12 ? 'AM' : 'PM'
    const label  = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
    const value  = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    options.push({ label, value })
  }
  return options
}

function parseISODateTime(iso, slotMins) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const date = d.toISOString().split('T')[0]
  const totalMins = d.getHours() * 60 + d.getMinutes()
  const snapped = Math.round(totalMins / slotMins) * slotMins
  const h = Math.floor(snapped / 60)
  const m = snapped % 60
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return { date, time }
}

function toISO(date, time) {
  if (!date || !time) return ''
  return `${date}T${time}:00`
}

export default function EditBookingModal({ event, roomName, onSave, onClose }) {
  const {
    bookingStartHour:    BOOKING_START_HOUR,
    bookingEndHour:      BOOKING_END_HOUR,
    slotDurationMinutes: SLOT_DURATION_MINUTES,
  } = useConfig()

  const TIME_OPTIONS = useMemo(
    () => buildTimeOptions(BOOKING_START_HOUR, BOOKING_END_HOUR, SLOT_DURATION_MINUTES),
    [BOOKING_START_HOUR, BOOKING_END_HOUR, SLOT_DURATION_MINUTES]
  )

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!event) return null

  const rawTitle = event.title.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const startParsed = parseISODateTime(event.start || event.startStr, SLOT_DURATION_MINUTES)
  const endParsed   = parseISODateTime(event.end   || event.endStr,   SLOT_DURATION_MINUTES)

  const originalBookedBy = event.extendedProps?.bookedBy || ''

  const [form, setForm] = useState({
    title: rawTitle,
    startDate: startParsed.date,
    startTime: startParsed.time || '09:00',
    endDate: endParsed.date,
    endTime: endParsed.time || '10:00',
    description: event.extendedProps?.description || '',
  })
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Event title is required.'); return }
    if (!form.startDate) { setError('Start date is required.'); return }
    if (!form.endDate) { setError('End date is required.'); return }

    const start = toISO(form.startDate, form.startTime)
    const end = toISO(form.endDate, form.endTime)
    if (start >= end) { setError('End must be after start.'); return }

    onSave({
      ...event,
      id: event.id,
      title: `${form.title.trim()} (${originalBookedBy})`,
      start,
      end,
      extendedProps: {
        ...event.extendedProps,  // preserve recurrenceGroupId, recurrenceIndex, etc.
        bookedBy:    originalBookedBy,
        description: form.description || null,
        rawTitle:    form.title.trim(), // keep rawTitle in sync
      },
    })
  }

  return (
    <div className="ebm-overlay">
      <div className="ebm-modal" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
        <div className="ebm-header">
          <h2>Edit Booking for {roomName}</h2>
          <button className="ebm-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="ebm-form">
          <label className="ebm-label-block">
            Event Title <span className="ebm-required">*</span>
            <input
              name="title"
              className="ebm-input"
              value={form.title}
              onChange={handleChange}
              placeholder="Event title"
            />
          </label>

          <label className="ebm-label-block">
            Start Date <span className="ebm-required">*</span>
            <div className="ebm-date-time-row">
              <input
                type="date"
                name="startDate"
                className="ebm-input"
                value={form.startDate}
                onChange={handleChange}
              />
              <select
                name="startTime"
                className="ebm-time-select"
                value={form.startTime}
                onChange={handleChange}
              >
                {TIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="ebm-label-block">
            End Date <span className="ebm-required">*</span>
            <div className="ebm-date-time-row">
              <input
                type="date"
                name="endDate"
                className="ebm-input"
                value={form.endDate}
                onChange={handleChange}
              />
              <select
                name="endTime"
                className="ebm-time-select"
                value={form.endTime}
                onChange={handleChange}
              >
                {TIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </label>

          {originalBookedBy && (
            <div className="ebm-readonly-row">
              <span className="ebm-readonly-label">Booked By</span>
              <span className="ebm-readonly-value">{originalBookedBy}</span>
            </div>
          )}

          <div className="ebm-label-block">
            Description
            <RichTextEditor
              value={form.description}
              onChange={html => { setForm(prev => ({ ...prev, description: html })); setError('') }}
              placeholder="Optional — supports bold, italic, links, lists…"
            />
          </div>

          {error && <p className="ebm-error">{error}</p>}

          <div className="ebm-actions">
            <button type="submit" className="ebm-btn-gold">Update Booking</button>
            <button type="button" className="ebm-btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
