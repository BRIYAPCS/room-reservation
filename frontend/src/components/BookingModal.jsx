import { useState, useEffect, useMemo } from 'react'
import './BookingModal.css'
import { useConfig } from '../context/ConfigContext'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../utils/roles'
import RichTextEditor from './RichTextEditor'
import ClearableInput from './ClearableInput'

const LAST_IDENTITY_KEY = 'last_booking_identity'

function loadLastIdentity() {
  try {
    const raw = localStorage.getItem(LAST_IDENTITY_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (_) { return null }
}

function saveLastIdentity(name, email) {
  try {
    localStorage.setItem(LAST_IDENTITY_KEY, JSON.stringify({ name, email }))
  } catch (_) {}
}

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

const pad        = n => String(n).padStart(2, '0')
const timeToMins = t => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m }
const minsToTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const toDateStr  = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// ── Repeat-type options (shown inside Recurring Event section) ─
const REPEAT_TYPES = [
  { value: 'daily',    label: 'Daily'    },
  { value: 'weekly',   label: 'Weekly'   },
  { value: 'biweekly', label: 'Bi-Weekly'},
  { value: 'monthly',  label: 'Monthly'  },
]

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Component ─────────────────────────────────────────────────
export default function BookingModal({
  onSave, onClose, initialDate, defaultBookedBy,
  initialStart, initialEnd, roomName, userName,
  existingEvents = [],   // all loaded events — used to grey out occupied time slots
}) {
  const {
    bookingStartHour:    BOOKING_START_HOUR,
    bookingEndHour:      BOOKING_END_HOUR,
    slotDurationMinutes: SLOT_DURATION_MINUTES,
    allowPastBookings:   ALLOW_PAST_BOOKINGS,
    enableRecurringEvents: ENABLE_RECURRING_EVENTS,
    recurringMaxMonths:  RECURRING_MAX_MONTHS,
  } = useConfig()

  const { auth } = useAuth()
  // Admins/superadmins can always book past dates/times.
  // Standard users follow the ALLOW_PAST_BOOKINGS config flag.
  const canBookPast = ALLOW_PAST_BOOKINGS || isAdmin(auth.role)
  const identityLocked = auth.emailVerified === true

  const TIME_OPTIONS = useMemo(
    () => buildTimeOptions(BOOKING_START_HOUR, BOOKING_END_HOUR, SLOT_DURATION_MINUTES),
    [BOOKING_START_HOUR, BOOKING_END_HOUR, SLOT_DURATION_MINUTES]
  )

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const startBound = BOOKING_START_HOUR * 60
  const endBound   = BOOKING_END_HOUR   * 60

  function clampMins(mins) {
    return Math.min(Math.max(mins, startBound), endBound)
  }

  // Today in YYYY-MM-DD — used as min for date pickers for standard users
  const todayStr = toDateStr(new Date())

  // Clamp initial date to today only for users who cannot book past.
  // Admins and superadmins keep the original date even if it's in the past.
  const rawParsedDate = initialStart
    ? initialStart.split('T')[0]
    : (initialDate || todayStr)
  const parsedDate = !canBookPast && rawParsedDate < todayStr ? todayStr : rawParsedDate
  const rawStart        = initialStart ? (initialStart.split('T')[1] || '').slice(0, 5) : null
  const rawEnd          = initialEnd   ? (initialEnd.split('T')[1]   || '').slice(0, 5) : null
  const parsedStartMins = clampMins(rawStart ? timeToMins(rawStart) : startBound)
  const parsedEndMins   = clampMins(rawEnd   ? timeToMins(rawEnd)   : parsedStartMins + SLOT_DURATION_MINUTES)

  // Determine initial name and email from session or saved identity
  const lastIdentity = identityLocked ? null : loadLastIdentity()
  const initialName  = identityLocked
    ? (auth.name  || defaultBookedBy || '')
    : (defaultBookedBy || lastIdentity?.name || '')
  const initialEmail = identityLocked
    ? (auth.email || '')
    : (auth.email || lastIdentity?.email || '')

  const [form, setForm] = useState({
    title:       '',
    bookedBy:    initialName,
    ownerEmail:  initialEmail,
    date:        parsedDate,         // start date (always)
    endDate:     parsedDate,         // end date — only used for multiday
    startTime:   minsToTime(parsedStartMins),
    endTime:     minsToTime(parsedEndMins),
    allDay:      false,
    description: '',
    recurring:   'none',             // 'none' | 'multiday' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
    recurUntil:  '',
    recurDays:   [1, 2, 3, 4, 5],   // day indices 0=Sun … 6=Sat; default Mon–Fri for weekly
  })
  const [error, setError] = useState('')

  // ── Past-time cutoff (minutes since midnight) ─────────────────
  // -1 means "no cutoff" (future date, or user is allowed to book past).
  // Floored to the current slot boundary so a partially-elapsed slot
  // (e.g. 3:00–3:15 when the clock reads 3:10) stays selectable —
  // consistent with CalendarPage.findFirstAvailableSlot which does the same.
  const nowMins = useMemo(() => {
    if (canBookPast) return -1  // admins and "allow past" config skip the cutoff
    if (!form.date || form.date !== toDateStr(new Date())) return -1
    const n = new Date()
    const mins = n.getHours() * 60 + n.getMinutes()
    return Math.floor(mins / SLOT_DURATION_MINUTES) * SLOT_DURATION_MINUTES
  }, [form.date, SLOT_DURATION_MINUTES, canBookPast])

  // ── Occupied intervals for form.date ─────────────────────────
  // Each existing event that falls on the selected day becomes a blocked
  // {start, end} interval (in minutes since midnight) that prevents overlap.
  const occupiedIntervals = useMemo(() => {
    if (!existingEvents?.length || !form.date) return []
    return existingEvents
      .filter(ev => ev.start && toDateStr(new Date(ev.start)) === form.date)
      .map(ev => {
        const s = new Date(ev.start)
        const e = new Date(ev.end || ev.start)
        const sMins = s.getHours() * 60 + s.getMinutes()
        // If the event ends on a later date, treat it as ending at the booking end hour
        const eMins = toDateStr(e) === form.date
          ? e.getHours() * 60 + e.getMinutes()
          : endBound
        return { start: sMins, end: eMins }
      })
  }, [existingEvents, form.date, endBound])

  // ── Valid start-time options ───────────────────────────────────
  // Filters out:
  //   • past times when today (nowMins cutoff)
  //   • times that land inside an already-booked interval (A ≤ t < B)
  const validStartOptions = useMemo(() => {
    return TIME_OPTIONS.filter(opt => {
      const t = timeToMins(opt.value)
      if (nowMins >= 0 && t < nowMins) return false
      return !occupiedIntervals.some(({ start: A, end: B }) => t >= A && t < B)
    })
  }, [TIME_OPTIONS, nowMins, occupiedIntervals])

  // ── Valid end-time options ────────────────────────────────────
  // Given the selected start time S, the end time E must satisfy:
  //   • E ≥ S + SLOT_DURATION_MINUTES (minimum booking length)
  //   • E ≤ first occupied-interval start A where A > S
  //     (we cannot extend into the next booking's window)
  const validEndOptions = useMemo(() => {
    const S = timeToMins(form.startTime || minsToTime(startBound))
    // Find the earliest booking that starts after our chosen start time
    let ceiling = endBound
    for (const { start: A, end: B } of occupiedIntervals) {
      if (A > S && B > S) ceiling = Math.min(ceiling, A)
    }
    return TIME_OPTIONS.filter(opt => {
      const t = timeToMins(opt.value)
      return t >= S + SLOT_DURATION_MINUTES && t <= ceiling
    })
  }, [TIME_OPTIONS, form.startTime, occupiedIntervals, endBound, SLOT_DURATION_MINUTES])

  const isRecurring = ['daily', 'weekly', 'biweekly', 'monthly'].includes(form.recurring)
  // Multi-day is auto-detected: same-day unless end date > start date (and not a recurring series)
  const isMultiDay  = !isRecurring && form.endDate > form.date

  // ── Auto-snap start time when it becomes invalid ──────────────
  // Fires when the selected date changes (today ↔ future) or when the
  // occupiedIntervals list changes.  Picks the first valid start option
  // so the form is never left with a time that cannot be submitted.
  useEffect(() => {
    if (!validStartOptions.length) return
    if (!validStartOptions.some(o => o.value === form.startTime)) {
      const newStart = validStartOptions[0].value
      const newStartMins = timeToMins(newStart)
      setForm(prev => ({
        ...prev,
        startTime: newStart,
        // Preserve the user's preferred duration, clamped to endBound
        endTime: minsToTime(Math.min(
          newStartMins + Math.max(SLOT_DURATION_MINUTES, timeToMins(prev.endTime) - timeToMins(prev.startTime)),
          endBound
        )),
      }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validStartOptions])

  // ── Auto-snap end time when it falls outside valid range ──────
  // Fires after start time snaps or the user picks a new start manually.
  useEffect(() => {
    if (!validEndOptions.length) return
    if (!validEndOptions.some(o => o.value === form.endTime)) {
      // Prefer the last valid end (keeps longest possible booking), not the first
      setForm(prev => ({ ...prev, endTime: validEndOptions[validEndOptions.length - 1].value }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validEndOptions])

  // Max date for "Repeat Until" — RECURRING_MAX_MONTHS from start date
  const maxRecurDate = useMemo(() => {
    const d = new Date(form.date + 'T00:00:00')
    d.setMonth(d.getMonth() + RECURRING_MAX_MONTHS)
    return toDateStr(d)
  }, [form.date])

  // Live occurrence count for recurring modes
  const occurrenceCount = useMemo(() => {
    if (!isRecurring || !form.recurUntil) return 0
    if (form.recurring === 'weekly' && form.recurDays.length === 0) return 0
    return buildEvents({ ...form, title: '_', bookedBy: '_' }, BOOKING_START_HOUR, BOOKING_END_HOUR).length
  }, [isRecurring, form.recurring, form.recurUntil, form.date, form.startTime, form.endTime, form.recurDays, BOOKING_START_HOUR, BOOKING_END_HOUR])

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: checked }))
      setError('')
      return
    }
    setForm(prev => {
      if (name === 'startTime') {
        const newStart = timeToMins(value)
        const duration = Math.max(SLOT_DURATION_MINUTES, timeToMins(prev.endTime) - timeToMins(prev.startTime))
        const newEnd   = Math.min(newStart + duration, endBound)
        return { ...prev, startTime: value, endTime: minsToTime(newEnd) }
      }
      if (name === 'date') {
        // Keep endDate >= date
        const newEndDate   = prev.endDate < value ? value : prev.endDate
        // Reset recurUntil if before new date
        const newRecurUntil = prev.recurUntil < value ? '' : prev.recurUntil
        return { ...prev, date: value, endDate: newEndDate, recurUntil: newRecurUntil }
      }
      if (name === 'endDate') {
        // Clamp to >= date
        const clamped = value < prev.date ? prev.date : value
        return { ...prev, endDate: clamped }
      }
      return { ...prev, [name]: value }
    })
    setError('')
  }

  function setBookingType(value) {
    setForm(prev => ({
      ...prev,
      recurring:  value,
      recurUntil: '',
      endDate:    prev.date,
    }))
    setError('')
  }

  // Toggle a weekday in/out of the weekly selection (minimum 1 day must remain)
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
    if (!form.title.trim())    { setError('Event title is required.'); return }
    if (!form.bookedBy.trim()) { setError('Booked By is required.'); return }

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

    // Pass multiday flag via recurring field so buildEvents handles it correctly
    const effectiveForm = !isRecurring && isMultiDay
      ? { ...form, recurring: 'multiday' }
      : form
    const events = buildEvents(effectiveForm, BOOKING_START_HOUR, BOOKING_END_HOUR)

    // ── Identity metadata ──────────────────────────────────────
    const ownerEmail  = form.ownerEmail.trim()
    const ownershipType = identityLocked ? 'email' : 'device'
    const identityMeta = {
      owner_email:               ownerEmail || null,
      ownership_type:            ownershipType,
      created_device_session_id: auth.deviceSessionId || null,
    }
    const enriched = events.map(ev => ({
      ...ev,
      extendedProps: { ...ev.extendedProps, ...identityMeta },
    }))

    // Persist last used identity for next time (only when not locked)
    if (!identityLocked) {
      saveLastIdentity(form.bookedBy.trim(), ownerEmail)
    }

    onSave(enriched)
    onClose()
  }

  return (
    <div className="bm-overlay">
      <div className="bm-modal">
        <div className="bm-header">
          <div className="bm-title-block">
            {roomName && <span className="bm-room-name">{roomName}</span>}
            {userName && <span className="bm-user-name">👤 {userName}</span>}
          </div>
          <button className="bm-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="bm-form">
          {/* bm-form-body scrolls independently; bm-actions stays pinned to the bottom */}
          <div className="bm-form-body">

          <label>
            Event Title <span className="required">*</span>
            <ClearableInput name="title" value={form.title} onChange={handleChange} placeholder="e.g. Team Meeting" />
          </label>

          <label>
            Booked By <span className="required">*</span>
            <ClearableInput
              name="bookedBy"
              value={form.bookedBy}
              onChange={handleChange}
              placeholder="Your name"
              disabled={identityLocked}
              className={identityLocked ? 'bm-input--locked' : undefined}
            />
          </label>

          <label>
            Email
            {identityLocked ? (
              /* Read-only verified email — styled as a distinct display, not a
                 disabled input, so it looks intentional on every screen size. */
              <div className="bm-email-locked">
                <span className="bm-email-locked-icon">🔒</span>
                <span className="bm-email-locked-address">{form.ownerEmail}</span>
                <span className="bm-email-locked-badge">Verified</span>
              </div>
            ) : (
              <ClearableInput
                type="email"
                name="ownerEmail"
                value={form.ownerEmail}
                onChange={handleChange}
                placeholder="Optional — your @briya.org email"
                autoComplete="email"
              />
            )}
          </label>

          {/* ── All Day + Recurring Event — same row ── */}
          <div className="bm-checks-row">
            <label className="bm-allday-label">
              <input
                type="checkbox"
                name="allDay"
                checked={form.allDay}
                onChange={handleChange}
                className="bm-allday-check"
              />
              <span className="bm-allday-text">All Day</span>
            </label>

            {ENABLE_RECURRING_EVENTS && (
              <label className="bm-allday-label">
                <input
                  type="checkbox"
                  className="bm-allday-check"
                  checked={isRecurring}
                  onChange={e => e.target.checked ? setBookingType('daily') : setBookingType('none')}
                />
                <span className="bm-allday-text">Recurring Event</span>
              </label>
            )}
          </div>

          {/* ── Date row ── */}
          <div className="bm-datetime-grid">
            <label className={isRecurring ? 'bm-span-full' : ''}>
              Start Date
              <input
                type="date"
                name="date"
                value={form.date}
                min={canBookPast ? undefined : todayStr}
                onChange={handleChange}
              />
            </label>
            {!isRecurring && (
              <label>
                End Date
                <input
                  type="date"
                  name="endDate"
                  value={form.endDate}
                  min={canBookPast ? undefined : (form.date >= todayStr ? form.date : todayStr)}
                  onChange={handleChange}
                />
              </label>
            )}
          </div>

          {/* ── Time row (hidden when All Day) ── */}
          {!form.allDay && (
            <div className="bm-datetime-grid">
              <label>
                Start Time
                <select name="startTime" value={form.startTime} onChange={handleChange}>
                  {validStartOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label>
                End Time
                <select name="endTime" value={form.endTime} onChange={handleChange}>
                  {validEndOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* ── Recurring sub-options (shown when recurring is checked above) ── */}
          {ENABLE_RECURRING_EVENTS && isRecurring && (
            <div className="bm-recur-section">
              <div className="bm-recur-sub">

                  {/* Repeat type radio row */}
                  <div className="bm-recur-type-row">
                    {REPEAT_TYPES.map(opt => (
                      <label key={opt.value} className="bm-type-radio">
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

                  {/* Weekly day picker */}
                  {form.recurring === 'weekly' && (
                    <div className="bm-weekday-block">
                      <span className="bm-field-label">
                        Repeats On <span className="required">*</span>
                      </span>
                      <div className="bm-weekday-picker">
                        {WEEK_DAYS.map((day, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`bm-weekday-btn${form.recurDays.includes(i) ? ' bm-weekday-btn--active' : ''}`}
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

                  {/* Ends On */}
                  <div className="bm-recur-until-block">
                    <label className="bm-recur-until-label">
                      Ends On <span className="required">*</span>
                      <input
                        type="date"
                        name="recurUntil"
                        value={form.recurUntil}
                        min={form.date}
                        max={maxRecurDate}
                        onChange={handleChange}
                      />
                    </label>
                    {occurrenceCount > 0 && (
                      <p className="bm-recur-summary">
                        <span className="bm-recur-summary-icon">📅</span>
                        <strong>{occurrenceCount}</strong>&nbsp;
                        {occurrenceCount === 1 ? 'occurrence' : 'occurrences'} will be created
                      </p>
                    )}
                  </div>

              </div>
            </div>
          )}

          <div className="bm-field-group">
            <span className="bm-field-label">Description</span>
            <RichTextEditor
              value={form.description}
              onChange={html => { setForm(prev => ({ ...prev, description: html })); setError('') }}
              placeholder="Optional — supports bold, italic, links, lists…"
            />
          </div>

          {error && <p className="bm-error">{error}</p>}

          </div>{/* end bm-form-body */}

          {/* Pinned footer — always visible, never scrolls behind content */}
          <div className="bm-actions">
            <button type="button" className="bm-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="bm-save">
              {isRecurring && occurrenceCount > 1
                ? `Book ${occurrenceCount} Events`
                : 'Book Room'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ── Tiny UUID-ish generator (no library needed) ───────────────
function genGroupId() {
  return 'rg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

// ── Event builder ─────────────────────────────────────────────
function buildEvents(form, BOOKING_START_HOUR, BOOKING_END_HOUR) {
  const isSeriesMode = ['daily', 'weekly', 'biweekly', 'monthly'].includes(form.recurring)
  const groupId = isSeriesMode ? genGroupId() : null

  const makeBase = (index) => ({
    title: `${form.title} (${form.bookedBy})`,
    backgroundColor: '#4abfce',
    borderColor:     '#3aaebe',
    extendedProps: {
      bookedBy:          form.bookedBy,
      description:       form.description || null,
      recurrenceGroupId: groupId,
      recurrenceIndex:   index,
    },
  })

  // "All Day" = timed event spanning the full booking window (respects configured hours).
  // This makes it visible in every calendar view, not just Month view.
  const allDayStart = `${pad(BOOKING_START_HOUR)}:00`
  const allDayEnd   = `${pad(BOOKING_END_HOUR)}:00`

  const startOf = date => `${date}T${form.allDay ? allDayStart : form.startTime}:00`
  const endOf   = date => `${date}T${form.allDay ? allDayEnd   : form.endTime}:00`

  // One-time single day
  if (form.recurring === 'none') {
    return [{
      ...makeBase(0),
      start: startOf(form.date),
      end:   endOf(form.date),
    }]
  }

  // Multi-day — one single event spanning start date/time → end date/time
  if (form.recurring === 'multiday') {
    return [{
      ...makeBase(0),
      start: startOf(form.date),
      end:   endOf(form.endDate),
    }]
  }

  // Recurring — series of individual day events, each stamped with its index
  const events = []
  const until  = new Date(form.recurUntil + 'T23:59:59')
  let   index  = 0

  if (form.recurring === 'daily') {
    const cur = new Date(form.date + 'T00:00:00')
    while (cur <= until) {
      const dow = cur.getDay()
      if (dow >= 1 && dow <= 5) {
        const d = toDateStr(cur)
        events.push({ ...makeBase(index++), start: startOf(d), end: endOf(d) })
      }
      cur.setDate(cur.getDate() + 1)
    }

  } else if (form.recurring === 'weekly') {
    const days = form.recurDays?.length ? form.recurDays : [1, 2, 3, 4, 5]
    const cur  = new Date(form.date + 'T00:00:00')
    while (cur <= until) {
      if (days.includes(cur.getDay())) {
        const d = toDateStr(cur)
        events.push({ ...makeBase(index++), start: startOf(d), end: endOf(d) })
      }
      cur.setDate(cur.getDate() + 1)
    }

  } else if (form.recurring === 'biweekly') {
    const cur = new Date(form.date + 'T00:00:00')
    while (cur <= until) {
      const d = toDateStr(cur)
      events.push({ ...makeBase(index++), start: startOf(d), end: endOf(d) })
      cur.setDate(cur.getDate() + 14)
    }

  } else if (form.recurring === 'monthly') {
    const origin     = new Date(form.date + 'T00:00:00')
    const dayOfMonth = origin.getDate()
    let year  = origin.getFullYear()
    let month = origin.getMonth()

    while (true) {
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const day = Math.min(dayOfMonth, daysInMonth)
      const cur = new Date(year, month, day)
      if (cur > until) break
      const d = toDateStr(cur)
      events.push({ ...makeBase(index++), start: startOf(d), end: endOf(d) })
      month++
      if (month > 11) { month = 0; year++ }
    }
  }

  return events
}
