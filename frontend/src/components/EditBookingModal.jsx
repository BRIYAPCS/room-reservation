import { useState, useMemo } from 'react'
import './EditBookingModal.css'
import { useConfig } from '../context/ConfigContext'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from './RichTextEditor'
import ClearableInput from './ClearableInput'

const pad        = n => String(n).padStart(2, '0')
const timeToMins = t => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m }
const minsToTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const toDateStr  = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const REPEAT_TYPES = [
  { value: 'daily',    label: 'Daily'     },
  { value: 'weekly',   label: 'Weekly'    },
  { value: 'biweekly', label: 'Bi-Weekly' },
  { value: 'monthly',  label: 'Monthly'   },
]
const WEEK_DAYS   = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildTimeOptions(startHour, endHour, slotMins) {
  const options = []
  for (let t = startHour * 60; t <= endHour * 60; t += slotMins) {
    const h = Math.floor(t / 60)
    const m = t % 60
    if (h === endHour && m > 0) break
    const hour12 = h % 12 === 0 ? 12 : h % 12
    const ampm   = h < 12 ? 'AM' : 'PM'
    options.push({
      label: `${hour12}:${pad(m)} ${ampm}`,
      value: `${pad(h)}:${pad(m)}`,
    })
  }
  return options
}

function parseISODateTime(iso, slotMins) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const date = d.toISOString().split('T')[0]
  const snapped = Math.round((d.getHours() * 60 + d.getMinutes()) / slotMins) * slotMins
  return {
    date,
    time: minsToTime(snapped),
  }
}

// ── Recurring event builder (matches BookingModal logic exactly) ──
function genGroupId() {
  return 'rg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function buildEvents(form, startHour, endHour) {
  const isSeries = ['daily', 'weekly', 'biweekly', 'monthly'].includes(form.recurring)
  const groupId  = isSeries ? genGroupId() : null
  const makeBase = idx => ({
    title: `${form.title} (${form.bookedBy})`,
    backgroundColor: '#4abfce',
    borderColor:     '#3aaebe',
    extendedProps: {
      bookedBy:          form.bookedBy,
      description:       form.description || null,
      recurrenceGroupId: groupId,
      recurrenceIndex:   idx,
      allDay:            form.allDay,
    },
  })
  const allDayStart = `${pad(startHour)}:00`
  const allDayEnd   = `${pad(endHour)}:00`
  const startOf = date => `${date}T${form.allDay ? allDayStart : form.startTime}:00`
  const endOf   = date => `${date}T${form.allDay ? allDayEnd   : form.endTime}:00`

  if (form.recurring === 'none') {
    return [{ ...makeBase(0), start: startOf(form.date), end: endOf(form.date) }]
  }
  if (form.recurring === 'multiday') {
    return [{ ...makeBase(0), start: startOf(form.date), end: endOf(form.endDate) }]
  }

  const evs   = []
  const until = new Date(form.recurUntil + 'T23:59:59')
  let idx = 0

  if (form.recurring === 'daily') {
    const cur = new Date(form.date + 'T00:00:00')
    while (cur <= until) {
      const dow = cur.getDay()
      if (dow >= 1 && dow <= 5) {
        const d = toDateStr(cur)
        evs.push({ ...makeBase(idx++), start: startOf(d), end: endOf(d) })
      }
      cur.setDate(cur.getDate() + 1)
    }
  } else if (form.recurring === 'weekly') {
    const days = form.recurDays?.length ? form.recurDays : [1, 2, 3, 4, 5]
    const cur  = new Date(form.date + 'T00:00:00')
    while (cur <= until) {
      if (days.includes(cur.getDay())) {
        const d = toDateStr(cur)
        evs.push({ ...makeBase(idx++), start: startOf(d), end: endOf(d) })
      }
      cur.setDate(cur.getDate() + 1)
    }
  } else if (form.recurring === 'biweekly') {
    const cur = new Date(form.date + 'T00:00:00')
    while (cur <= until) {
      const d = toDateStr(cur)
      evs.push({ ...makeBase(idx++), start: startOf(d), end: endOf(d) })
      cur.setDate(cur.getDate() + 14)
    }
  } else if (form.recurring === 'monthly') {
    const origin     = new Date(form.date + 'T00:00:00')
    const dayOfMonth = origin.getDate()
    let year  = origin.getFullYear()
    let month = origin.getMonth()
    while (true) {
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const cur = new Date(year, month, Math.min(dayOfMonth, daysInMonth))
      if (cur > until) break
      const d = toDateStr(cur)
      evs.push({ ...makeBase(idx++), start: startOf(d), end: endOf(d) })
      month++
      if (month > 11) { month = 0; year++ }
    }
  }
  return evs
}

export default function EditBookingModal({ event, ownerEmail, roomName, onSave, onClose }) {
  const { auth } = useAuth()
  const {
    bookingStartHour:      BOOKING_START_HOUR,
    bookingEndHour:        BOOKING_END_HOUR,
    slotDurationMinutes:   SLOT_DURATION_MINUTES,
    enableRecurringEvents: ENABLE_RECURRING_EVENTS,
    recurringMaxMonths:    RECURRING_MAX_MONTHS,
  } = useConfig()

  const TIME_OPTIONS = useMemo(
    () => buildTimeOptions(BOOKING_START_HOUR, BOOKING_END_HOUR, SLOT_DURATION_MINUTES),
    [BOOKING_START_HOUR, BOOKING_END_HOUR, SLOT_DURATION_MINUTES]
  )

  if (!event) return null

  const rawTitle    = event.title.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const bookedBy    = event.extendedProps?.bookedBy || ''
  const startParsed = parseISODateTime(event.start || event.startStr, SLOT_DURATION_MINUTES)
  const endParsed   = parseISODateTime(event.end   || event.endStr,   SLOT_DURATION_MINUTES)

  const [form, setForm] = useState({
    title:       rawTitle,
    date:        startParsed.date,
    endDate:     endParsed.date || startParsed.date,
    startTime:   startParsed.time || `${pad(BOOKING_START_HOUR)}:00`,
    endTime:     endParsed.time   || minsToTime(BOOKING_START_HOUR * 60 + SLOT_DURATION_MINUTES),
    description: event.extendedProps?.description || '',
    allDay:      !!(event.extendedProps?.allDay),
    recurring:   'none',
    recurUntil:  '',
    recurDays:   [1, 2, 3, 4, 5],
  })
  const [error, setError] = useState('')

  const isRecurring = ['daily', 'weekly', 'biweekly', 'monthly'].includes(form.recurring)
  const isMultiDay  = !isRecurring && form.endDate > form.date

  const maxRecurDate = useMemo(() => {
    const d = new Date(form.date + 'T00:00:00')
    d.setMonth(d.getMonth() + RECURRING_MAX_MONTHS)
    return toDateStr(d)
  }, [form.date, RECURRING_MAX_MONTHS])

  const occurrenceCount = useMemo(() => {
    if (!isRecurring || !form.recurUntil) return 0
    if (form.recurring === 'weekly' && form.recurDays.length === 0) return 0
    return buildEvents({ ...form, title: '_', bookedBy: '_' }, BOOKING_START_HOUR, BOOKING_END_HOUR).length
  }, [isRecurring, form.recurring, form.recurUntil, form.date, form.startTime, form.endTime, form.recurDays, BOOKING_START_HOUR, BOOKING_END_HOUR])

  // End-time options: must be after startTime
  const validEndOptions = useMemo(() => {
    const S = timeToMins(form.startTime)
    return TIME_OPTIONS.filter(opt => timeToMins(opt.value) >= S + SLOT_DURATION_MINUTES)
  }, [TIME_OPTIONS, form.startTime, SLOT_DURATION_MINUTES])

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value }
      if (name === 'date') {
        if (next.endDate < value) next.endDate = value
        if (next.recurUntil < value) next.recurUntil = ''
      }
      if (name === 'endDate') {
        next.endDate = value < prev.date ? prev.date : value
      }
      return next
    })
    setError('')
  }

  function setBookingType(value) {
    setForm(prev => ({ ...prev, recurring: value, recurUntil: '', endDate: prev.date }))
    setError('')
  }

  function toggleDay(dayIndex) {
    setForm(prev => {
      const next = prev.recurDays.includes(dayIndex)
        ? prev.recurDays.filter(d => d !== dayIndex)
        : [...prev.recurDays, dayIndex].sort((a, b) => a - b)
      return next.length === 0 ? prev : { ...prev, recurDays: next }
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Event title is required.'); return }
    if (!isRecurring && form.endDate < form.date) {
      setError('End date must be on or after the start date.'); return
    }
    if (!form.allDay && (form.endDate === form.date || isRecurring) && form.startTime >= form.endTime) {
      setError('End time must be after start time.'); return
    }
    if (isRecurring && !form.recurUntil) {
      setError('Please choose an "Ends On" date for this series.'); return
    }
    if (form.recurring === 'weekly' && form.recurDays.length === 0) {
      setError('Please select at least one day for weekly recurrence.'); return
    }

    const startTime = form.allDay ? `${pad(BOOKING_START_HOUR)}:00` : form.startTime
    const endTime   = form.allDay ? `${pad(BOOKING_END_HOUR)}:00`   : form.endTime

    if (isRecurring) {
      // Convert this booking into a recurring series — CalendarPage will delete the
      // original and POST the new series
      const events = buildEvents(
        { ...form, bookedBy, startTime, endTime },
        BOOKING_START_HOUR, BOOKING_END_HOUR
      )
      onSave(events)
      return
    }

    // Non-recurring — standard single-event update
    const effectiveForm = isMultiDay ? { ...form, recurring: 'multiday' } : form
    const [built]       = buildEvents(
      { ...effectiveForm, bookedBy, startTime, endTime },
      BOOKING_START_HOUR, BOOKING_END_HOUR
    )
    onSave({
      ...event,
      id:    event.id,
      title: built.title,
      start: built.start,
      end:   built.end,
      extendedProps: {
        ...event.extendedProps,
        bookedBy,
        description: form.description || null,
        rawTitle:    form.title.trim(),
        allDay:      form.allDay,
      },
    })
  }

  return (
    <div className="ebm-overlay">
      <div className="ebm-modal" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>

        {/* Header — mirrors BookingModal's title block */}
        <div className="ebm-header">
          <div className="ebm-title-block">
            {roomName && <span className="ebm-room-name">{roomName}</span>}
            {auth.name && <span className="ebm-user-name">👤 {auth.name}</span>}
          </div>
          <button className="ebm-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="ebm-form">
          <div className="ebm-form-body">

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

            {/* Booked By — read-only */}
            {bookedBy && (
              <div className="ebm-readonly-row">
                <span className="ebm-readonly-label">Booked By</span>
                <span className="ebm-readonly-value">{bookedBy}</span>
              </div>
            )}

            {ownerEmail && (
              <div className="ebm-readonly-row ebm-readonly-row--email">
                <span className="ebm-readonly-label">🔒 Email</span>
                <span className="ebm-readonly-value ebm-readonly-email">{ownerEmail}</span>
              </div>
            )}

            {/* All Day + Recurring Event checkboxes — same row */}
            <div className="ebm-checks-row">
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

              {ENABLE_RECURRING_EVENTS && (
                <label className="ebm-allday-label">
                  <input
                    type="checkbox"
                    className="ebm-allday-check"
                    checked={isRecurring}
                    onChange={e => e.target.checked ? setBookingType('daily') : setBookingType('none')}
                  />
                  <span className="ebm-allday-text">Recurring Event</span>
                </label>
              )}
            </div>

            {/* Dates */}
            <div className="ebm-date-grid">
              <label className={`ebm-label-block${isRecurring ? ' ebm-span-full' : ''}`}>
                Start Date <span className="ebm-required">*</span>
                <input
                  type="date"
                  name="date"
                  className="ebm-input"
                  value={form.date}
                  onChange={handleChange}
                />
              </label>
              {!isRecurring && (
                <label className="ebm-label-block">
                  End Date <span className="ebm-required">*</span>
                  <input
                    type="date"
                    name="endDate"
                    className="ebm-input"
                    value={form.endDate}
                    min={form.date}
                    onChange={handleChange}
                  />
                </label>
              )}
            </div>

            {/* Times — hidden when All Day */}
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
                    {validEndOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* Recurring sub-options */}
            {ENABLE_RECURRING_EVENTS && isRecurring && (
              <div className="ebm-recur-section">
                <div className="ebm-recur-sub">

                  <div className="ebm-recur-type-row">
                    {REPEAT_TYPES.map(opt => (
                      <label key={opt.value} className="ebm-type-radio">
                        <input
                          type="radio"
                          name="recurType"
                          checked={form.recurring === opt.value}
                          onChange={() => setBookingType(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>

                  {form.recurring === 'weekly' && (
                    <div className="ebm-weekday-block">
                      <span className="ebm-field-label">
                        Repeats On <span className="ebm-required">*</span>
                      </span>
                      <div className="ebm-weekday-picker">
                        {WEEK_DAYS.map((day, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`ebm-weekday-btn${form.recurDays.includes(i) ? ' ebm-weekday-btn--active' : ''}`}
                            onClick={() => toggleDay(i)}
                            aria-label={WEEK_LABELS[i]}
                            aria-pressed={form.recurDays.includes(i)}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="ebm-recur-until-block">
                    <label className="ebm-recur-until-label">
                      Ends On <span className="ebm-required">*</span>
                      <input
                        type="date"
                        name="recurUntil"
                        className="ebm-input"
                        value={form.recurUntil}
                        min={form.date}
                        max={maxRecurDate}
                        onChange={handleChange}
                      />
                    </label>
                    {occurrenceCount > 0 && (
                      <p className="ebm-recur-summary">
                        <span>📅</span>
                        <strong>{occurrenceCount}</strong>&nbsp;
                        {occurrenceCount === 1 ? 'occurrence' : 'occurrences'} will be created
                      </p>
                    )}
                  </div>

                </div>
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

          </div>{/* end ebm-form-body */}

          <div className="ebm-actions">
            <button type="button" className="ebm-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="ebm-btn-gold">
              {isRecurring && occurrenceCount > 1
                ? `Create ${occurrenceCount} Events`
                : 'Update Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
