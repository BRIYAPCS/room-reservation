import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { isAdmin } from '../utils/roles'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import BriyaLogo from '../components/BriyaLogo'
import Breadcrumb from '../components/Breadcrumb'
import BookingModal from '../components/BookingModal'
import LoginModal from '../components/LoginModal'
import UserAvatar from '../components/UserAvatar'
import EventDetailsModal from '../components/EventDetailsModal'
import EditBookingModal from '../components/EditBookingModal'
import CrossDeviceVerifyModal from '../components/CrossDeviceVerifyModal'
import LegacyClaimModal from '../components/LegacyClaimModal'
import RecurrenceActionSheet from '../components/RecurrenceActionSheet'
import { useAuth } from '../context/AuthContext'
import { useConfig } from '../context/ConfigContext'
import VisitorCounter from '../components/VisitorCounter'
import * as api from '../services/api'
import ClearableInput from '../components/ClearableInput'
import './CalendarPage.css'

export default function CalendarPage() {
  const { siteId, roomId } = useParams()
  const navigate = useNavigate()
  const calendarRef = useRef(null)
  const toastTimer = useRef(null)
  const { auth } = useAuth()

  // ── App config from backend .env via /api/config ─────────────
  const {
    bookingStartHour:      BOOKING_START_HOUR,
    bookingEndHour:        BOOKING_END_HOUR,
    slotDurationMinutes:   SLOT_DURATION_MINUTES,
    allowWeekendBookings:  ALLOW_WEEKEND_BOOKINGS,
    allowPastBookings:     ALLOW_PAST_BOOKINGS,
    allowDoubleBooking:    ALLOW_DOUBLE_BOOKING,
    editOthersRole:        EDIT_OTHERS_ROLE,
    requireLoginForCalendar: REQUIRE_LOGIN_FOR_CALENDAR,
    canCreateRoles:        CAN_CREATE_ROLES,
    businessDays:          BUSINESS_DAYS,
    businessStart:         BUSINESS_START,
    businessEnd:           BUSINESS_END,
  } = useConfig()

  const pad = n => String(n).padStart(2, '0')
  const SLOT_MIN_TIME    = `${pad(BOOKING_START_HOUR)}:00:00`
  const SLOT_MAX_TIME    = `${pad(BOOKING_END_HOUR)}:00:00`
  const CONSTRAINT_START = `${pad(BOOKING_START_HOUR)}:00`
  const CONSTRAINT_END   = `${pad(BOOKING_END_HOUR)}:00`
  const canDelete = (event) => {
    if (auth.role === 'superadmin') return true  // superadmin can delete any booking
    if (!CAN_CREATE_ROLES.includes(auth.role)) return false
    if (isAdmin(auth.role)) return true
    // standard: only own bookings that have not yet ended
    const isPast = new Date(event?.end || event?.endStr) <= new Date()
    if (isPast) return false
    // Ownership-aware: must match by email (if email-type) or device session (if device-type)
    // Legacy rows (no ownershipType) cannot be verified — deny
    const ep = event?.extendedProps || {}
    if (!ep.ownershipType) return false
    if (ep.ownershipType === 'email') {
      return auth.emailVerified === true &&
             !!auth.email &&
             auth.email.toLowerCase() === (ep.ownerEmail || '').toLowerCase()
    }
    return !!auth.deviceSessionId && auth.deviceSessionId === ep.createdDeviceSessionId
  }

  const [site, setSite] = useState(null)
  const [room, setRoom] = useState(null)
  const { visitorCounterEnabled } = useConfig()

  useEffect(() => {
    api.getSite(siteId).then(setSite).catch(() => {})
    api.getRoom(siteId, roomId).then(setRoom).catch(() => {})
  }, [siteId, roomId])

  const [showLoginModal, setShowLoginModal] = useState(
    () => REQUIRE_LOGIN_FOR_CALENDAR && auth.role === 'none'
  )

  // If the user logs out while on the Calendar page, immediately re-prompt
  useEffect(() => {
    if (REQUIRE_LOGIN_FOR_CALENDAR && auth.role === 'none') {
      setShowBookingModal(false)
      setShowEditModal(false)
      setShowEventDetails(false)
      setShowLoginModal(true)
    }
  }, [auth.role])
  // Recurrence action sheet state
  // recurAction: { action: 'edit'|'delete', event } | null
  const [recurAction, setRecurAction] = useState(null)
  // Stores the chosen scope for group edits — kept separate from selectedEvent
  // so we never spread a FullCalendar proxy object
  const [recurEditMeta, setRecurEditMeta] = useState(null) // { scope, groupId, fromIndex } | null

  const [viewMode, setViewMode] = useState('calendar') // 'calendar' | 'list'
  const [calView, setCalView] = useState('timeGridWorkWeek')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [newBookingTimes, setNewBookingTimes] = useState(null) // { start, end } from drag-select

  // Live event state — loaded via /api/reservations
  const [events, setEvents] = useState([])
  const [eventsLoadError, setEventsLoadError] = useState(false)

  useEffect(() => {
    setEventsLoadError(false)
    api.getReservations(siteId, roomId)
      .then(data => { setEvents(data); setEventsLoadError(false) })
      .catch(() => { setEvents([]); setEventsLoadError(true) })
  }, [siteId, roomId])

  const [refreshing, setRefreshing] = useState(false)

  const refreshEvents = useCallback(async (silent = false) => {
    setRefreshing(true)
    try {
      const data = await api.getReservations(siteId, roomId)
      setEvents(data)
      if (!silent) showToast('Calendar refreshed.')
    } catch {
      if (!silent) showToast('Failed to refresh.', 'error')
    } finally {
      setRefreshing(false)
    }
  }, [siteId, roomId])

  // Event details / edit states
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventDetails, setShowEventDetails] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  // Legacy booking claim
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [claimEvent,     setClaimEvent]     = useState(null)

  // Cross-device ownership verification
  const [showCrossDeviceModal, setShowCrossDeviceModal] = useState(false)
  const [crossDeviceEvent, setCrossDeviceEvent] = useState(null)
  const [crossDeviceAction, setCrossDeviceAction] = useState('edit') // 'edit' | 'delete'
  // editToken issued after OTP verification — held in memory only, never persisted
  const [pendingEditToken, setPendingEditToken] = useState(null)

  // List view filters
  const [showPast, setShowPast] = useState(false)
  const [myEvents, setMyEvents] = useState(false)
  const [filterUser, setFilterUser] = useState('')

  // Toast notifications
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })

  // Hover tooltip (desktop only)
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, title: '', bookedBy: '', desc: '', time: '', isActive: false })

  // ── Auth helpers ──────────────────────────────────────────────
  const getActionState = (event) => {
    if (auth.role === 'superadmin') return { status: 'allowed' }
    if (!CAN_CREATE_ROLES.includes(auth.role)) return { status: 'denied', reason: 'Role cannot edit' }
    if (isAdmin(auth.role) || EDIT_OTHERS_ROLE === 'all') return { status: 'allowed' }

    const ep = event?.extendedProps || {}
    if (!ep.ownershipType) return { status: 'legacy_claim' }

    if (ep.ownershipType === 'email') {
      // emailVerified is set by the server after the user proves inbox access at login.
      // Once proven, the user can edit their own bookings from any device — no second OTP.
      if (auth.emailVerified && auth.email?.toLowerCase() === (ep.ownerEmail || '').toLowerCase()) {
        return { status: 'allowed' }
      }
      return { status: 'otp_required', reason: 'Email verification required to edit this booking' }
    }

    if (ep.ownershipType === 'device') {
      if (!!auth.deviceSessionId && auth.deviceSessionId === ep.createdDeviceSessionId) return { status: 'allowed' }
      return { status: 'otp_required', reason: 'Must use OTP' }
    }
    return { status: 'denied', reason: 'Unknown ownership type' }
  }

  // Returns true when the list view should show an edit button (rather than view-only).
  // Includes otp_required so users can still initiate the OTP flow from the list.
  // Past events are never editable for non-admin users regardless of ownership.
  const canEdit = (event) => {
    if (!isAdmin(auth.role) && new Date(event.end || event.endStr) <= new Date()) return false
    const state = getActionState(event)
    return state.status === 'allowed' || state.status === 'otp_required'
  }

  // ── Toast helper ──────────────────────────────────────────────
  function showToast(message, type = 'success') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ show: true, message, type })
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3200)
  }

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // ── Per-event editable flag ───────────────────────────────────
  const fcEvents = useMemo(() => {
    const now = new Date()
    return events.map(ev => {
      const isPast = new Date(ev.end) <= now
      const ep     = ev.extendedProps || {}

      const state = getActionState(ev)
      // Drag-drop strictly requires an already-allowed state (bypasses OTP modals)
      const editable = state.status === 'allowed' && (!isPast || isAdmin(auth.role))
      return { ...ev, editable, classNames: isPast && !isAdmin(auth.role) ? ['fc-event-past'] : [] }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, auth.role, auth.deviceSessionId, auth.emailVerified, auth.email])

  // ── Detect overlapping event IDs ─────────────────────────────
  // overlappingIds  = ALL events involved in any conflict (for ⚠ badge)
  // conflictSecondaryIds = only the 2nd+ events per conflict group (for orange color)
  const { overlappingIds, conflictSecondaryIds } = useMemo(() => {
    const allIds = new Set()
    const secondaryIds = new Set()

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i], b = events[j]
        const aStart = new Date(a.start), aEnd = new Date(a.end)
        const bStart = new Date(b.start), bEnd = new Date(b.end)
        if (aStart < bEnd && aEnd > bStart) {
          allIds.add(String(a.id))
          allIds.add(String(b.id))
          // The one that starts later (or has a higher id if same start) is "secondary"
          if (bStart > aStart || (bStart.getTime() === aStart.getTime() && b.id > a.id)) {
            secondaryIds.add(String(b.id))
          } else {
            secondaryIds.add(String(a.id))
          }
        }
      }
    }
    return { overlappingIds: allIds, conflictSecondaryIds: secondaryIds }
  }, [events])

  // ── Check if a time range overlaps any existing event ────────
  function hasOverlap(start, end) {
    return events.some(ev =>
      new Date(start) < new Date(ev.end) && new Date(end) > new Date(ev.start)
    )
  }

  // ── Helpers ───────────────────────────────────────────────────
  const changeCalView = useCallback((view) => {
    setCalView(view)
    calendarRef.current?.getApi().changeView(view)
  }, [])

  const navToday = () => calendarRef.current?.getApi().today()
  const navPrev  = () => calendarRef.current?.getApi().prev()
  const navNext  = () => calendarRef.current?.getApi().next()

  const handleSaveBooking = async (newEvents) => {
    const conflicts = newEvents.filter(ev => hasOverlap(ev.start, ev.end))
    if (conflicts.length > 0) {
      if (!ALLOW_DOUBLE_BOOKING) {
        showToast('⚠️ This time slot is already booked. Please choose a different time.', 'error')
        return
      }
      showToast(`⚠️ This booking overlaps with ${conflicts.length} existing booking${conflicts.length > 1 ? 's' : ''}.`, 'warning')
    }
    await api.addEvents(siteId, roomId, newEvents).catch(() => {})
    refreshEvents(true)
  }

  const handleDeleteRequest = (event) => {
    if (new Date(event.end || event.endStr) <= new Date() && !isAdmin(auth.role)) {
      showToast('Past bookings cannot be deleted.', 'error')
      return
    }

    const state = getActionState(event)
    if (state.status === 'denied') {
      showToast(`Access Denied: ${state.reason}`, 'error')
      return
    }
    if (state.status === 'legacy_claim') {
      setClaimEvent(event)
      setShowClaimModal(true)
      setShowEventDetails(false)
      return
    }
    if (state.status === 'otp_required' && !pendingEditToken) {
      showToast(state.reason === 'Email not verified' ? 'Verify your email to delete this booking.' : 'Must verify via OTP.', 'warning')
      setCrossDeviceEvent(event)
      setCrossDeviceAction('delete')
      setShowCrossDeviceModal(true)
      setShowEventDetails(false)
      return
    }

    const groupId = event?.extendedProps?.recurrenceGroupId
    if (groupId) {
      setShowEventDetails(false)
      setRecurAction({ action: 'delete', event })
    } else {
      handleDeleteEvent(event.id || event.extendedProps?.id)
    }
  }

  const handleDeleteEvent = async (eventId, editToken = null) => {
    // Safety net: re-check pastness here so the OTP success path cannot
    // delete a past event if time elapsed between request and verification.
    const eventToDelete = events.find(ev => String(ev.id) === String(eventId)) || selectedEvent
    if (eventToDelete && !isAdmin(auth.role)) {
      const end = new Date(eventToDelete.end || eventToDelete.endStr)
      if (end <= new Date()) {
        showToast('Past bookings cannot be deleted.', 'error')
        setPendingEditToken(null)
        return
      }
    }
    const token = editToken !== null ? editToken : pendingEditToken
    setPendingEditToken(null)
    await api.deleteEvent(siteId, roomId, eventId, token).catch(() => {})
    refreshEvents(true)
    setShowEventDetails(false)
    setSelectedEvent(null)
    showToast('Booking deleted.', 'error')
  }

  const handleEditRequest = (event) => {
    if (new Date(event.end || event.endStr) <= new Date() && !isAdmin(auth.role)) {
      showToast('Past bookings cannot be edited.', 'error')
      return
    }

    const state = getActionState(event)
    if (state.status === 'denied') {
      showToast(`Access Denied: ${state.reason}`, 'error')
      return
    }
    if (state.status === 'legacy_claim') {
      setClaimEvent(event)
      setShowClaimModal(true)
      setShowEventDetails(false)
      return
    }
    if (state.status === 'otp_required' && !pendingEditToken) {
      showToast('Sign in with your verified email to edit this booking.', 'warning')
      setCrossDeviceEvent(event)
      setCrossDeviceAction('edit')
      setShowCrossDeviceModal(true)
      setShowEventDetails(false)
      return
    }

    const groupId = event?.extendedProps?.recurrenceGroupId
    if (groupId) {
      setShowEventDetails(false)
      setRecurAction({ action: 'edit', event })
    } else {
      setShowEventDetails(false)
      setShowEditModal(true)
    }
  }

  // Handles the scope choice from RecurrenceActionSheet
  const handleRecurrenceChoice = async (scope) => {
    const { action, event } = recurAction
    const groupId = event?.extendedProps?.recurrenceGroupId
    const fromIndex = event?.extendedProps?.recurrenceIndex ?? 0
    setRecurAction(null)

    if (action === 'delete') {
      const token = pendingEditToken
      setPendingEditToken(null)
      if (scope === 'this') {
        await api.deleteEvent(siteId, roomId, event.id, token).catch(() => {})
      } else {
        await api.deleteRecurrenceGroup(siteId, roomId, groupId, scope, fromIndex).catch(() => {})
      }
      refreshEvents(true)
      setShowEventDetails(false)
      setSelectedEvent(null)
      showToast(
        scope === 'all' ? 'All occurrences deleted.' :
        scope === 'following' ? 'This and following occurrences deleted.' :
        'Booking deleted.',
        'error'
      )
    } else {
      // action === 'edit' — store scope separately, never touch selectedEvent
      if (scope === 'this') {
        setRecurEditMeta(null)
      } else {
        setRecurEditMeta({ scope, groupId, fromIndex })
      }
      setShowEditModal(true)
    }
  }

  const handleUpdateEvent = async (updatedEvent) => {
    const meta = recurEditMeta
    // Use the in-memory OTP edit token (never persisted to storage)
    const editToken = pendingEditToken
    setPendingEditToken(null)
    if (meta?.scope && meta?.groupId) {
      await api.updateRecurrenceGroup(siteId, roomId, meta.groupId, meta.scope, meta.fromIndex, updatedEvent).catch(() => {})
    } else {
      await api.updateEvent(siteId, roomId, updatedEvent, editToken).catch(() => {})
    }
    refreshEvents(true)
    setShowEditModal(false)
    setShowEventDetails(false)
    setSelectedEvent(null)
    setRecurEditMeta(null)
    showToast(
      meta?.scope === 'all'       ? 'All occurrences updated.' :
      meta?.scope === 'following' ? 'This and following occurrences updated.' :
      'Booking updated.'
    )
  }

  // ── Resolve the booking date, skipping weekends if not allowed ──
  function resolveBookingDate(dateStr) {
    if (ALLOW_WEEKEND_BOOKINGS) return dateStr
    const d = new Date(dateStr + 'T00:00:00')
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1)
    }
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  // ── Find first available slot on a given date ────────────────
  // Walks sorted dayEvents from `startFrom`, advancing past any that overlap
  // the cursor.  Works correctly even when startFrom > all event start times
  // (e.g. a late-night fallback that resets to 8 AM still skips booked slots).
  function findFirstAvailableSlot(date) {
    const pad = n => String(n).padStart(2, '0')
    const toMins = iso => {
      const t = (iso || '').includes('T') ? iso.split('T')[1] : iso
      const [h, m] = (t || '00:00').split(':').map(Number)
      return h * 60 + m
    }
    const toTimeStr = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

    const dayEvents = events
      .filter(ev => (ev.start || '').startsWith(date))
      .map(ev => ({ start: toMins(ev.start), end: toMins(ev.end) }))
      .sort((a, b) => a.start - b.start)

    const bookingStart = BOOKING_START_HOUR * 60
    const limit        = BOOKING_END_HOUR   * 60

    // Scan from `from`, jumping past any overlapping events
    function scanFrom(from) {
      let cur = from
      for (const ev of dayEvents) {
        if (cur + SLOT_DURATION_MINUTES <= ev.start) break  // free gap before this event
        if (ev.end > cur) {
          cur = Math.ceil(ev.end / SLOT_DURATION_MINUTES) * SLOT_DURATION_MINUTES
        }
      }
      return cur
    }

    // Use local date for today comparison (toISOString() returns UTC which is
    // wrong for users in negative-offset timezones after ~8 PM local time)
    const now = new Date()
    const p2 = n => String(n).padStart(2, '0')
    const todayStr = `${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())}`

    // For today: start at current clock slot; for other dates: booking start
    let startFrom = bookingStart
    if (date === todayStr) {
      const nowMins = now.getHours() * 60 + now.getMinutes()
      const currentSlotStart = Math.floor(nowMins / SLOT_DURATION_MINUTES) * SLOT_DURATION_MINUTES
      startFrom = Math.max(currentSlotStart, bookingStart)
    }

    let cursor = scanFrom(startFrom)

    // No slot left from startFrom (after hours / end of day) → fall back to
    // bookingStart and rescan so we still skip already-booked morning slots
    if (cursor + SLOT_DURATION_MINUTES > limit) {
      cursor = scanFrom(bookingStart)
      if (cursor + SLOT_DURATION_MINUTES > limit) cursor = bookingStart
    }

    return {
      start: `${date}T${toTimeStr(cursor)}:00`,
      end:   `${date}T${toTimeStr(cursor + SLOT_DURATION_MINUTES)}:00`,
    }
  }

  // ── Convert a JS Date to local "YYYY-MM-DDTHH:mm:ss" ─────────
  // Using .startStr / .endStr is unreliable on touch — FC can return
  // UTC strings ("...Z") or offset strings ("...-04:00"). Both cause
  // MySQL to store the wrong hour. Reading from the Date object and
  // formatting with local clock methods is always correct.
  function toLocalISO(date) {
    if (!date) return date
    const d = new Date(date)
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }

  // ── FullCalendar callbacks ────────────────────────────────────
  const handleSelect = (info) => {
    if (REQUIRE_LOGIN_FOR_CALENDAR && auth.role === 'none') {
      calendarRef.current?.getApi().unselect()
      setShowLoginModal(true)
      return
    }
    if (!isAdmin(auth.role)) {
      if (!ALLOW_WEEKEND_BOOKINGS) {
        const day = info.start.getDay()
        if (day === 0 || day === 6) {
          calendarRef.current?.getApi().unselect()
          showToast('Bookings are not allowed on weekends.', 'error')
          return
        }
      }
      if (!ALLOW_PAST_BOOKINGS && info.end <= new Date()) {
        calendarRef.current?.getApi().unselect()
        showToast('This time has already passed and cannot be booked.', 'error')
        return
      }
    }
    setNewBookingTimes({ start: toLocalISO(info.start), end: toLocalISO(info.end) })
    setSelectedDate(info.startStr.split('T')[0])
    setShowBookingModal(true)
  }

  const handleEventDrop = async (info) => {
    if (!isAdmin(auth.role) && new Date(info.event.end) <= new Date()) {
      info.revert()
      showToast("Past bookings cannot be moved.", 'error')
      return
    }
    if (getActionState(info.event).status !== 'allowed') {
      info.revert()
      showToast("Cannot move this booking (OTP or Claim required).", 'error')
      return
    }
    try {
      await api.updateEvent(siteId, roomId, {
        id: info.event.id,
        start: toLocalISO(info.event.start),
        end:   toLocalISO(info.event.end),
        extendedProps: { ...info.event.extendedProps },
      })
      refreshEvents(true)
      showToast('Booking moved successfully.')
    } catch {
      info.revert()
      showToast('Failed to save. Please try again.', 'error')
    }
  }

  const handleEventResize = async (info) => {
    if (!isAdmin(auth.role) && new Date(info.event.end) <= new Date()) {
      info.revert()
      showToast("Past bookings cannot be resized.", 'error')
      return
    }
    if (getActionState(info.event).status !== 'allowed') {
      info.revert()
      showToast("Cannot resize this booking (OTP or Claim required).", 'error')
      return
    }
    try {
      await api.updateEvent(siteId, roomId, {
        id: info.event.id,
        start: toLocalISO(info.event.start),
        end:   toLocalISO(info.event.end),
        extendedProps: { ...info.event.extendedProps },
      })
      refreshEvents(true)
      showToast('Booking duration updated.')
    } catch {
      info.revert()
      showToast('Failed to save. Please try again.', 'error')
    }
  }

  const handleEventMouseEnter = (info) => {
    const e = info.jsEvent
    const now = new Date()
    const isActive = !!(info.event.start && info.event.end &&
      info.event.start <= now && now < info.event.end)
    setTooltip({
      show: true,
      x: e.clientX,
      y: e.clientY,
      title: info.event.title.replace(/\s*\([^)]*\)\s*$/, '').trim(),
      bookedBy: info.event.extendedProps?.bookedBy || '',
      desc: '',
      time: `${formatTime(info.event.startStr)} – ${formatTime(info.event.endStr)}`,
      isActive,
    })
  }

  const handleEventMouseLeave = () => {
    setTooltip(t => ({ ...t, show: false }))
  }

  // ── List view data ────────────────────────────────────────────
  const now = new Date()
  const listEvents = events
    .filter(ev => showPast || new Date(ev.start) >= now)
    .filter(ev => !myEvents || ev.extendedProps?.bookedBy === auth.name)
    .filter(ev => !filterUser || ev.extendedProps?.bookedBy?.toLowerCase().includes(filterUser.toLowerCase()))
    .sort((a, b) => new Date(a.start) - new Date(b.start))

  // ── Excel export (admin only) — pure-JS .xlsx, no extra package ──
  function exportToExcel() {
    const roomLabel = room?.name || roomId
    const siteLabel = site?.name || siteId
    const fileName  = `${siteLabel} - ${roomLabel} Reservations.xlsx`

    // Strip HTML tags for description cells
    const stripHtml = html => {
      if (!html) return ''
      return html.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim()
    }

    const fmtFull = iso => new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
    const fmtTime = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

    // Build rows — use ALL events (not filtered list) for a complete export
    const allSorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start))
    const rows = allSorted.map(ev => [
      ev.extendedProps?.rawTitle || ev.title.replace(/\s*\([^)]*\)\s*$/, '').trim(),
      ev.extendedProps?.bookedBy || '',
      fmtFull(ev.start),
      fmtTime(ev.end),
      stripHtml(ev.extendedProps?.description),
    ])

    const headers = ['Title', 'Booked By', 'Start Time', 'End Time', 'Description']
    const allRows = [headers, ...rows]

    // ── Build minimal .xlsx (Office Open XML) ──────────────────
    const esc = s => String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&apos;')

    // Shared-string table (every cell is an inline string — simplest valid xlsx)
    const cellRef = (col, row) => `${String.fromCharCode(65 + col)}${row}`

    const sheetRows = allRows.map((row, ri) =>
      `<row r="${ri + 1}">${row.map((val, ci) =>
        `<c r="${cellRef(ci, ri + 1)}" t="inlineStr"><is><t>${esc(val)}</t></is></c>`
      ).join('')}</row>`
    ).join('')

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Reservations" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"   ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

    // ── Pack into a ZIP (minimal, no compression — pure JS) ────
    function strToBytes(str) {
      return new TextEncoder().encode(str)
    }

    function makeLocalFile(name, data) {
      const nameBytes = strToBytes(name)
      const crc = crc32(data)
      const header = new Uint8Array(30 + nameBytes.length)
      const view   = new DataView(header.buffer)
      view.setUint32(0,  0x04034b50, true) // local file header sig
      view.setUint16(4,  20, true)          // version needed
      view.setUint16(6,  0, true)           // flags
      view.setUint16(8,  0, true)           // no compression
      view.setUint16(10, 0, true)           // mod time
      view.setUint16(12, 0, true)           // mod date
      view.setUint32(14, crc, true)
      view.setUint32(18, data.length, true)
      view.setUint32(22, data.length, true)
      view.setUint16(26, nameBytes.length, true)
      view.setUint16(28, 0, true)
      header.set(nameBytes, 30)
      return { header, data, nameBytes, crc, offset: 0 }
    }

    function makeCentralDir(entry) {
      const nameBytes = entry.nameBytes
      const rec = new Uint8Array(46 + nameBytes.length)
      const view = new DataView(rec.buffer)
      view.setUint32(0,  0x02014b50, true) // central dir sig
      view.setUint16(4,  20, true)
      view.setUint16(6,  20, true)
      view.setUint16(8,  0, true)
      view.setUint16(10, 0, true)
      view.setUint16(12, 0, true)
      view.setUint16(14, 0, true)
      view.setUint32(16, entry.crc, true)
      view.setUint32(20, entry.data.length, true)
      view.setUint32(24, entry.data.length, true)
      view.setUint16(28, nameBytes.length, true)
      view.setUint16(30, 0, true)
      view.setUint16(32, 0, true)
      view.setUint16(34, 0, true)
      view.setUint16(36, 0, true)
      view.setUint32(38, 0x20, true)       // external attr = file
      view.setUint32(42, entry.offset, true)
      rec.set(nameBytes, 46)
      return rec
    }

    function makeEOCD(numEntries, centralDirSize, centralDirOffset) {
      const eocd = new Uint8Array(22)
      const view = new DataView(eocd.buffer)
      view.setUint32(0,  0x06054b50, true)
      view.setUint16(4,  0, true)
      view.setUint16(6,  0, true)
      view.setUint16(8,  numEntries, true)
      view.setUint16(10, numEntries, true)
      view.setUint32(12, centralDirSize, true)
      view.setUint32(16, centralDirOffset, true)
      view.setUint16(20, 0, true)
      return eocd
    }

    function crc32(data) {
      const table = crc32.table || (crc32.table = (() => {
        const t = new Uint32Array(256)
        for (let i = 0; i < 256; i++) {
          let c = i
          for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
          t[i] = c
        }
        return t
      })())
      let crc = 0xffffffff
      for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
      return (crc ^ 0xffffffff) >>> 0
    }

    function concat(...arrays) {
      const total = arrays.reduce((s, a) => s + a.length, 0)
      const out   = new Uint8Array(total)
      let offset  = 0
      for (const a of arrays) { out.set(a, offset); offset += a.length }
      return out
    }

    const files = [
      { name: '[Content_Types].xml',              src: contentTypesXml  },
      { name: '_rels/.rels',                      src: workbookRelsXml  },
      { name: 'xl/workbook.xml',                  src: workbookXml      },
      { name: 'xl/_rels/workbook.xml.rels',       src: relsXml          },
      { name: 'xl/worksheets/sheet1.xml',         src: sheetXml         },
    ]

    const entries = []
    let offset = 0
    const localParts = []

    for (const f of files) {
      const data  = strToBytes(f.src)
      const entry = makeLocalFile(f.name, data)
      entry.offset = offset
      const block = concat(entry.header, entry.data)
      localParts.push(block)
      offset += block.length
      entries.push(entry)
    }

    const centralDirOffset = offset
    const centralParts = entries.map(makeCentralDir)
    const centralDirSize = centralParts.reduce((s, p) => s + p.length, 0)
    const eocd = makeEOCD(entries.length, centralDirSize, centralDirOffset)

    const blob = new Blob(
      [...localParts, ...centralParts, eocd],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    )
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatDateTime(iso) {
    const d = new Date(iso)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  }

  function formatTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="cal-page">
      {/* Top nav bar */}
      <div className="cal-topbar">
        <button className="back-btn" onClick={() => navigate(`/rooms/${siteId}`)}>← Rooms</button>
        <div className="cal-topbar-center">
          <div className="logo-wrap">
            <BriyaLogo size={40} />
          </div>
          <div className="breadcrumb-box">
            {site?.name} &#9658; {room?.name}
          </div>
        </div>
        <div className="cal-topbar-right">
          <div className="view-toggle">
            <button className={viewMode === 'calendar' ? 'active' : ''} onClick={() => setViewMode('calendar')}>Calendar</button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>List</button>
          </div>
          <UserAvatar theme="dark" onLoginClick={() => setShowLoginModal(true)} />
        </div>
      </div>

      {/* Content area */}
      <div className="cal-content">
        {eventsLoadError && (
          <div className="cal-load-error" role="alert">
            <span>⚠ Could not load reservations — check your connection.</span>
            <button className="cal-load-error-retry" onClick={() => refreshEvents(false)}>
              ↺ Retry
            </button>
            <span className="cal-load-error-contact">If this keeps happening, contact IT.</span>
          </div>
        )}
        <Breadcrumb
          variant="on-white"
          items={[
            { label: 'Home', path: '/' },
            { label: site?.name || siteId, path: `/rooms/${siteId}` },
            { label: room?.name || roomId },
          ]}
        />

        {/* Action toolbar */}
        <div className="cal-toolbar">
          <button
            className="btn-new-booking"
            onClick={() => {
              if (REQUIRE_LOGIN_FOR_CALENDAR && auth.role === 'none') { setShowLoginModal(true); return }
              const now = new Date()
              const p = n => String(n).padStart(2, '0')
              // Use local date (not UTC) so late-night users get the correct day
              let base = `${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}`
              // After booking hours → advance to next day so we don't suggest a past date
              const nowMins = now.getHours() * 60 + now.getMinutes()
              if (nowMins >= BOOKING_END_HOUR * 60) {
                const tomorrow = new Date(now)
                tomorrow.setDate(tomorrow.getDate() + 1)
                base = `${tomorrow.getFullYear()}-${p(tomorrow.getMonth()+1)}-${p(tomorrow.getDate())}`
              }
              const date = resolveBookingDate(base)
              setNewBookingTimes(findFirstAvailableSlot(date))
              setShowBookingModal(true)
            }}
          >
            + New Booking
          </button>
          <button
            className={`btn-refresh${refreshing ? ' btn-refresh--loading' : ''}`}
            onClick={() => refreshEvents(false)}
            disabled={refreshing}
          >
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {viewMode === 'calendar' ? (
          <>
            {/* Calendar nav */}
            <div className="cal-nav">
              <div className="cal-nav-left">
                <button onClick={navToday}>Today</button>
                <button onClick={navPrev}>Back</button>
                <button onClick={navNext}>Next</button>
              </div>
              <div className="cal-nav-title" id="cal-title-display">&nbsp;</div>
              <div className="cal-nav-right">
                {[
                  { key: 'dayGridMonth', label: 'Month', mobile: false },
                  { key: 'timeGridWeek', label: 'Week', mobile: false },
                  { key: 'timeGridWorkWeek', label: 'Work Week', mobile: true },
                  { key: 'timeGridDay', label: 'Day', mobile: true },
                ].map(v => (
                  <button
                    key={v.key}
                    className={[calView === v.key ? 'active' : '', !v.mobile ? 'hide-mobile' : ''].join(' ').trim()}
                    onClick={() => changeCalView(v.key)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={[
              'fc-wrapper',
              !isAdmin(auth.role) ? 'fc-wrapper--standard' : '',
              !isAdmin(auth.role) && new Date().getHours() >= BOOKING_END_HOUR ? 'fc-wrapper--today-closed' : '',
            ].filter(Boolean).join(' ')}>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridWorkWeek"
                weekends={true}
                views={{
                  timeGridWorkWeek: {
                    type: 'timeGrid',
                    duration: { weeks: 1 },
                    weekends: false,
                    buttonText: 'Work Week',
                  },
                }}
                headerToolbar={false}
                dayHeaderContent={(arg) => {
                  if (isAdmin(auth.role)) return <span>{arg.text}</span>
                  const now = new Date()
                  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  const tomorrowMidnight = new Date(todayMidnight.getTime() + 86400000)
                  const isPastDay = arg.date < todayMidnight
                  const isTodayClosed = !isPastDay && arg.date >= todayMidnight && arg.date < tomorrowMidnight && now.getHours() >= BOOKING_END_HOUR
                  const showBadge = !ALLOW_PAST_BOOKINGS && (isPastDay || isTodayClosed)
                  return (
                    <span>
                      {arg.text}
                      {showBadge && (
                        <span
                          className="cal-day-header-past-badge"
                          title={isTodayClosed ? `Booking closed after ${BOOKING_END_HOUR > 12 ? BOOKING_END_HOUR - 12 : BOOKING_END_HOUR}${BOOKING_END_HOUR >= 12 ? 'pm' : 'am'}` : 'This day has passed — no new bookings'}
                        >
                          {isTodayClosed ? '🔒' : '🚫'}
                          <span className="cal-past-label">{isTodayClosed ? ' Closed' : ' Past'}</span>
                        </span>
                      )}
                    </span>
                  )
                }}
                slotMinTime={SLOT_MIN_TIME}
                slotMaxTime={SLOT_MAX_TIME}
                allDaySlot={false}
                slotDuration={`00:${String(SLOT_DURATION_MINUTES).padStart(2,'0')}:00`}
                snapDuration={`00:${String(SLOT_DURATION_MINUTES).padStart(2,'0')}:00`}
                events={fcEvents}
                height="auto"

                /* ── Interaction ── */
                editable={true}
                selectable={true}
                selectMirror={true}
                unselectAuto={false}
                nowIndicator={true}
                dayMaxEvents={true}

                /* ── Booking time + weekend restrictions (see appConfig.js) ── */
                selectConstraint={ALLOW_WEEKEND_BOOKINGS
                  ? { startTime: CONSTRAINT_START, endTime: CONSTRAINT_END }
                  : { startTime: CONSTRAINT_START, endTime: CONSTRAINT_END, daysOfWeek: [1,2,3,4,5] }
                }
                eventConstraint={ALLOW_WEEKEND_BOOKINGS
                  ? { startTime: CONSTRAINT_START, endTime: CONSTRAINT_END }
                  : { startTime: CONSTRAINT_START, endTime: CONSTRAINT_END, daysOfWeek: [1,2,3,4,5] }
                }
                selectAllow={(selectInfo) => {
                  if (isAdmin(auth.role)) return true
                  // Block weekends when not allowed
                  if (!ALLOW_WEEKEND_BOOKINGS) {
                    const day = selectInfo.start.getDay()
                    if (day === 0 || day === 6) return false
                  }
                  // Block past slots
                  if (!ALLOW_PAST_BOOKINGS && selectInfo.end <= new Date()) return false
                  return true
                }}

                /* ── Business hours highlight ── */
                businessHours={{
                  daysOfWeek: BUSINESS_DAYS,
                  startTime:  BUSINESS_START,
                  endTime:    BUSINESS_END,
                }}

                /* ── Touch delays (ms) ── */
                longPressDelay={250}
                eventLongPressDelay={250}
                selectLongPressDelay={300}

                /* ── Callbacks ── */
                datesSet={() => {
                  const el = document.getElementById('cal-title-display')
                  if (el && calendarRef.current) el.textContent = calendarRef.current.getApi().view.title
                }}
                dateClick={(info) => {
                  if (REQUIRE_LOGIN_FOR_CALENDAR && auth.role === 'none') { setShowLoginModal(true); return }
                  if (!isAdmin(auth.role)) {
                    // Block weekend clicks
                    if (!ALLOW_WEEKEND_BOOKINGS) {
                      const day = info.date.getDay()
                      if (day === 0 || day === 6) {
                        showToast('Bookings are not allowed on weekends.', 'error')
                        return
                      }
                    }
                    // Block past clicks
                    if (!ALLOW_PAST_BOOKINGS) {
                      const slotEnd = new Date(info.date.getTime() + SLOT_DURATION_MINUTES * 60000)
                      if (slotEnd <= new Date()) {
                        showToast('This time has already passed and cannot be booked.', 'error')
                        return
                      }
                    }
                  }
                  const date = resolveBookingDate(info.dateStr.split('T')[0])
                  setSelectedDate(date)
                  setNewBookingTimes(findFirstAvailableSlot(date))
                  setShowBookingModal(true)
                }}
                select={handleSelect}
                eventClick={(info) => {
                  setTooltip(t => ({ ...t, show: false }))
                  // Wrap plain object if needed (list-view passes plain obj, FC passes Event obj)
                  setSelectedEvent(info.event)
                  setShowEventDetails(true)
                }}
                eventDrop={handleEventDrop}
                eventResize={handleEventResize}
                eventMouseEnter={handleEventMouseEnter}
                eventMouseLeave={handleEventMouseLeave}

                /* ── Custom event rendering ── */
                eventContent={(arg) => {
                  const displayTitle = arg.event.title.replace(/\s*\([^)]*\)\s*$/, '').trim()
                  const bookedBy     = arg.event.extendedProps?.bookedBy || ''
                  const editable     = arg.event.startEditable
                  const isConflict   = overlappingIds.has(String(arg.event.id))
                  const isSecondary  = conflictSecondaryIds.has(String(arg.event.id))
                  const durationMins = (arg.event.end - arg.event.start) / 60000
                  const isShort      = durationMins <= 20
                  const isMonthView  = arg.view.type === 'dayGridMonth'
                  // Green live-dot: event is currently happening right now
                  const nowTs   = Date.now()
                  const isActive = !!(arg.event.start && arg.event.end &&
                    arg.event.start.getTime() <= nowTs && nowTs < arg.event.end.getTime())

                  if (isMonthView) {
                    return (
                      <div className={[
                        'fc-month-pill',
                        isSecondary ? 'fc-month-pill--conflict' : '',
                      ].filter(Boolean).join(' ')}>
                        {isConflict && <span className="fc-month-pill-warn" title="Overlapping booking">⚠</span>}
                        <span className={['fc-month-pill-dot', isActive ? 'fc-month-pill-dot--live' : ''].filter(Boolean).join(' ')} />
                        <span className="fc-month-pill-title">{displayTitle}</span>
                        {bookedBy && <span className="fc-month-pill-who">{bookedBy}</span>}
                      </div>
                    )
                  }

                  return (
                    <div className={[
                      'fc-event-inner',
                      isSecondary ? 'fc-event-inner--conflict' : '',
                      isShort     ? 'fc-event-inner--short'    : '',
                    ].filter(Boolean).join(' ')}>
                      {isConflict && <span className="fc-event-conflict-badge" title="Overlapping booking">⚠</span>}
                      {/* Green pulsing dot when this event is currently in progress */}
                      {isActive && <span className="fc-event-live-dot" aria-label="Meeting in progress" />}
                      {isShort ? (
                        <span className="fc-event-short-row">
                          <span className="fc-event-time">{arg.timeText}</span>
                          <span className="fc-event-title">{displayTitle}</span>
                        </span>
                      ) : (
                        <>
                          <span className="fc-event-time">{arg.timeText}</span>
                          <span className="fc-event-title">{displayTitle}</span>
                          {bookedBy && <span className="fc-event-who">{bookedBy}</span>}
                        </>
                      )}
                      {/* Show drag hint only when not active — the green live dot takes its place */}
                      {editable && !isActive && <span className="fc-event-drag-hint" aria-hidden="true" />}
                    </div>
                  )
                }}
              />
            </div>
          </>
        ) : (
          /* List view */
          <div className="list-view">
            <div className="list-filters">
              <label className="filter-check">
                <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
                Show Past Events
              </label>
              {auth.role !== 'none' && (
                <label className="filter-check">
                  <input type="checkbox" checked={myEvents} onChange={e => setMyEvents(e.target.checked)} />
                  My Events
                </label>
              )}
              <label className="filter-user">
                Filter by User:
                <ClearableInput
                  type="text"
                  placeholder="Enter name"
                  value={filterUser}
                  onChange={e => setFilterUser(e.target.value)}
                />
              </label>
              {isAdmin(auth.role) && (
                <button className="list-export-btn" onClick={exportToExcel} title="Export all reservations to Excel">
                  ⬇ Export Excel
                </button>
              )}
            </div>

            <div className="list-table-wrap"><table className="list-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Booked By</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listEvents.length === 0 && (
                  <tr><td colSpan={6} className="list-empty">No bookings found.</td></tr>
                )}
                {listEvents.map(ev => (
                  <tr
                    key={ev.id}
                    onClick={() => { setSelectedEvent(ev); setShowEventDetails(true) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{ev.extendedProps?.rawTitle || ev.title}</td>
                    <td>{ev.extendedProps?.bookedBy || '—'}</td>
                    <td>{formatDateTime(ev.start)}</td>
                    <td style={{ color: '#1186c4' }}>{formatTime(ev.end)}</td>
                    <td className="list-desc-cell">
                      {ev.extendedProps?.description
                        ? <span dangerouslySetInnerHTML={{ __html: ev.extendedProps.description }} />
                        : ''}
                    </td>
                    <td onClick={e => e.stopPropagation()} className="list-actions-cell">
                      {canEdit(ev) ? (
                        <button
                          className="list-edit-btn"
                          onClick={() => { setSelectedEvent(ev); handleEditRequest(ev) }}
                          title="Edit"
                        >
                          ✎
                        </button>
                      ) : (
                        <button
                          className="list-view-btn"
                          onClick={() => { setSelectedEvent(ev); setShowEventDetails(true) }}
                          title="View details"
                        >
                          👁
                        </button>
                      )}
                      {canDelete(ev) && (
                        <button
                          className="list-delete-btn"
                          onClick={() => { setSelectedEvent(ev); setShowEventDetails(true) }}
                          title="Delete"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </div>

      {/* ── Tooltip (desktop hover only) ── */}
      {tooltip.show && (
        <div
          className="cal-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <div className="cal-tooltip-title">{tooltip.title}</div>
          {tooltip.bookedBy && <div className="cal-tooltip-row">👤 {tooltip.bookedBy}</div>}
          {tooltip.time && <div className="cal-tooltip-row">🕐 {tooltip.time}</div>}
          {tooltip.desc && <div className="cal-tooltip-row cal-tooltip-desc">{tooltip.desc}</div>}
          {tooltip.isActive && (
            <div className="cal-tooltip-live">
              <span>●</span> Meeting in progress
            </div>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      {toast.show && (
        <div className={`cal-toast cal-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal
          required={REQUIRE_LOGIN_FOR_CALENDAR && auth.role === 'none'}
          onBack={() => navigate(`/rooms/${siteId}`)}
          onClose={() => setShowLoginModal(false)}
          onDismiss={() => setShowLoginModal(false)}
        />
      )}

      {/* Event Details Modal */}
      {showEventDetails && selectedEvent && (() => {
        // Compute series position live from events state — auto-updates after any deletion
        const groupId = selectedEvent?.extendedProps?.recurrenceGroupId
        let seriesInfo = null
        if (groupId) {
          const sid = String(selectedEvent?.id ?? '')
          const siblings = [...events]
            .filter(ev => ev.extendedProps?.recurrenceGroupId === groupId)
            .sort((a, b) => new Date(a.start) - new Date(b.start))
          const total    = siblings.length
          const position = siblings.findIndex(ev => String(ev.id) === sid) + 1
          seriesInfo = { position: position > 0 ? position : 1, total }
        }
        return (
          <EventDetailsModal
            event={selectedEvent}
            actionState={getActionState(selectedEvent)}
            isAdmin={isAdmin(auth.role)}
            isRecurring={!!groupId}
            seriesInfo={seriesInfo}
            onEdit={() => handleEditRequest(selectedEvent)}
            onDelete={() => handleDeleteRequest(selectedEvent)}
            onClaim={() => {
              setClaimEvent(selectedEvent)
              setShowEventDetails(false)
              setShowClaimModal(true)
            }}
            onClose={() => { setShowEventDetails(false); setSelectedEvent(null) }}
          />
        )
      })()}

      {/* Recurrence Action Sheet */}
      {recurAction && (() => {
        const groupId = recurAction.event?.extendedProps?.recurrenceGroupId
        const thisIndex = recurAction.event?.extendedProps?.recurrenceIndex ?? 0
        // Find the lowest index still alive in this group among loaded events
        const minIndex = groupId
          ? Math.min(...events
              .filter(e => e.extendedProps?.recurrenceGroupId === groupId)
              .map(e => e.extendedProps?.recurrenceIndex ?? 0))
          : 0
        const isFirst = thisIndex === minIndex
        return (
          <RecurrenceActionSheet
            action={recurAction.action}
            recurrenceIndex={isFirst ? 0 : 1}
            onChoose={handleRecurrenceChoice}
            onClose={() => { setRecurAction(null); setShowEventDetails(true) }}
          />
        )
      })()}

      {/* Edit Booking Modal */}
      {showEditModal && selectedEvent && (
        <EditBookingModal
          event={{
            id: selectedEvent.id,
            title: selectedEvent.title,
            start: selectedEvent.start || selectedEvent.startStr,
            end: selectedEvent.end || selectedEvent.endStr,
            extendedProps: selectedEvent.extendedProps,
            backgroundColor: selectedEvent.backgroundColor,
            borderColor: selectedEvent.borderColor,
          }}
          ownerEmail={selectedEvent.extendedProps?.ownerEmail || ''}
          roomName={room?.name}
          onSave={handleUpdateEvent}
          onClose={() => { setShowEditModal(false); setSelectedEvent(null); setRecurEditMeta(null) }}
        />
      )}

      {/* Legacy booking claim */}
      {showClaimModal && claimEvent && (
        <LegacyClaimModal
          siteId={siteId}
          roomId={roomId}
          event={claimEvent}
          onSuccess={() => {
            setShowClaimModal(false)
            setClaimEvent(null)
            setSelectedEvent(null)
            refreshEvents(true)
            showToast('Booking claimed successfully.')
          }}
          onCancel={() => {
            setShowClaimModal(false)
            setClaimEvent(null)
          }}
        />
      )}

      {/* Cross-device ownership verification */}
      {showCrossDeviceModal && crossDeviceEvent && (
        <CrossDeviceVerifyModal
          siteId={siteId}
          roomId={roomId}
          event={crossDeviceEvent}
          onSuccess={editToken => {
            // Store editToken in state (memory-only)
            setPendingEditToken(editToken)
            setShowCrossDeviceModal(false)
            const event    = crossDeviceEvent
            const action   = crossDeviceAction
            setCrossDeviceEvent(null)
            setCrossDeviceAction('edit')
            setSelectedEvent(event)
            const groupId = event?.extendedProps?.recurrenceGroupId

            if (action === 'delete') {
              if (groupId) {
                // Recurring delete — show the action sheet (pendingEditToken is now set)
                setRecurAction({ action: 'delete', event })
              } else {
                // Direct delete — pass editToken immediately (state update is async)
                handleDeleteEvent(event.id, editToken)
              }
            } else {
              // Edit
              if (groupId) {
                setRecurAction({ action: 'edit', event })
              } else {
                setShowEditModal(true)
              }
            }
          }}
          onCancel={() => {
            setShowCrossDeviceModal(false)
            setCrossDeviceEvent(null)
            setCrossDeviceAction('edit')
          }}
        />
      )}

      {/* Live visitor counter */}
      {visitorCounterEnabled && <VisitorCounter />}

      {/* New Booking Modal */}
      {showBookingModal && (
        <BookingModal
          initialDate={selectedDate}
          initialStart={newBookingTimes?.start}
          initialEnd={newBookingTimes?.end}
          defaultBookedBy={auth.name || ''}
          roomName={room?.name}
          userName={auth.name}
          existingEvents={events}
          onSave={handleSaveBooking}
          onClose={() => {
            calendarRef.current?.getApi().unselect()
            setShowBookingModal(false)
            setSelectedDate(null)
            setNewBookingTimes(null)
          }}
        />
      )}
    </div>
  )
}
