import { useState, useMemo } from 'react'
import './EditBookingModal.css'
import { useConfig } from '../context/ConfigContext'
import RichTextEditor from './RichTextEditor'
import ClearableInput from './ClearableInput'

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

function pad2(n) { return String(n).padStart(2, '0') }

export default function EditBookingModal({ event, ownerEmail, roomName, onSave, onClose }) {
  const {
    bookingStartHour:    BOOKING_START_HOUR,
    bookingEndHour:      BOOKING_END_HOUR,
    slotDurationMinutes: SLOT_DURATION_MINUTES,
  } = useConfig()

  const TIME_OPTIONS = useMemo(
    () => buildTimeOptions(BOOKING_START_HOUR, BOOKING_END_HOUR, SLOT_DURATION_MINUTES),
    [BOOKING_START_HOUR, BOOKING_END_HOUR, SLOT_DURATION_MINUTES]
  )

  if (!event) return null

  const rawTitle    = event.title.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const startParsed = parseISODateTime(event.start || event.startStr, SLOT_DURATION_MINUTES)
  const endParsed   = parseISODateTime(event.end   || event.endStr,   SLOT_DURATION_MINUTES)

  const [form, setForm] = useState({
    title:       rawTitle,
    bookedBy:    event.extendedProps?.bookedBy || '',
    startDate:   startParsed.date,
    startTime:   startParsed.time || `${pad2(BOOKING_START_HOUR)}:00`,
    endDate:     endParsed.date   || startParsed.date,
    endTime:     endParsed.time   || `${pad2(Math.min(BOOKING_START_HOUR + 1, BOOKING_END_HOUR))}:00`,
    description: event.extendedProps?.description || '',
    allDay:      !!(event.extendedProps?.allDay),
  })
  const [error, setError] = useState('')

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      // When start date changes, clamp end date to be >= start date
      ...(name === 'startDate' && value > prev.endDate ? { endDate: value } : {}),
    }))
    setError('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim())   { setError('Event title is required.'); return }
    if (!form.bookedBy.trim()) { setError('Booked By is required.'); return }
    if (!form.startDate)      { setError('Start date is required.'); return }
    if (!form.endDate)        { setError('End date is required.'); return }

    const startTime = form.allDay ? `${pad2(BOOKING_START_HOUR)}:00` : form.startTime
    const endTime   = form.allDay ? `${pad2(BOOKING_END_HOUR)}:00`   : form.endTime
    const start = toISO(form.startDate, startTime)
    const end   = toISO(form.endDate,   endTime)
    if (!form.allDay && start >= end) { setError('End must be after start.'); return }

    onSave({
      ...event,
      id:    event.id,
      title: `${form.title.trim()} (${form.bookedBy.trim()})`,
      start,
      end,
      extendedProps: {
        ...event.extendedProps,
        bookedBy:    form.bookedBy.trim(),
        description: form.description || null,
        rawTitle:    form.title.trim(),
        allDay:      form.allDay,
      },
    })
  }

  return (
    <div className="ebm-overlay">
      <div className="ebm-modal" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
        <div className="ebm-header">
          <h2>Edit Booking{roomName ? ` — ${roomName}` : ''}</h2>
          <button className="ebm-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="ebm-form">

          <label className="ebm-label-block">
            Event Title <span className="ebm-required">*</span>
            <ClearableInput
              name="title"
              className="ebm-input"
              value={form.title}
              onChange={handleChange}
              placeholder="Event title"
            />
          </label>

          <label className="ebm-label-block">
            Booked By <span className="ebm-required">*</span>
            <ClearableInput
              name="bookedBy"
              className="ebm-input"
              value={form.bookedBy}
              onChange={handleChange}
              placeholder="Your name"
            />
          </label>

          {/* ── All Day toggle ── */}
          <div className="ebm-allday-row">
            <label className="ebm-allday-label">
              <input
                type="checkbox"
                name="allDay"
                checked={form.allDay}
                onChange={handleChange}
                className="ebm-allday-check"
              />
              <span className="ebm-allday-text">All Day</span>
            </label>
          </div>

          {/* ── Dates ── */}
          <div className="ebm-date-grid">
            <label className="ebm-label-block">
              Start Date <span className="ebm-required">*</span>
              <input
                type="date"
                name="startDate"
                className="ebm-input"
                value={form.startDate}
                onChange={handleChange}
              />
            </label>
            <label className="ebm-label-block">
              End Date <span className="ebm-required">*</span>
              <input
                type="date"
                name="endDate"
                className="ebm-input"
                value={form.endDate}
                min={form.startDate}
                onChange={handleChange}
              />
            </label>
          </div>

          {/* ── Times (hidden when All Day) ── */}
          {!form.allDay && (
            <div className="ebm-date-grid">
              <label className="ebm-label-block">
                Start Time
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
              </label>
              <label className="ebm-label-block">
                End Time
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
              </label>
            </div>
          )}

          {ownerEmail && (
            <div className="ebm-readonly-row ebm-readonly-row--email">
              <span className="ebm-readonly-label">🔒 Email</span>
              <span className="ebm-readonly-value ebm-readonly-email">{ownerEmail}</span>
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
