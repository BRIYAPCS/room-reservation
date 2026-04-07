import { useEffect, useState } from 'react'
import './EventDetailsModal.css'

function formatDateTimeRange(start, end) {
  const startDate = new Date(start)
  const endDate = new Date(end)

  const dateStr = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return `${dateStr} ${startTime} – ${endTime}`
}

function getDisplayTitle(event) {
  if (event.extendedProps?.rawTitle) return event.extendedProps.rawTitle
  // Strip anything in parentheses at the end
  return event.title.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

function formatEditedAt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function EventDetailsModal({ event, canEdit, canDelete, onEdit, onDelete, onClose, isRecurring, seriesInfo }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!event) return null

  const title = getDisplayTitle(event)
  const bookedBy = event.extendedProps?.bookedBy || '—'
  const description = event.extendedProps?.description || ''
  const lastEditedBy = event.extendedProps?.lastEditedBy || ''
  const lastEditedAt = event.extendedProps?.lastEditedAt || ''
  const timeRange = formatDateTimeRange(event.start || event.startStr, event.end || event.endStr)

  if (confirmDelete) {
    return (
      <div className="edm-overlay">
        <div className="edm-modal">
          <h2 className="edm-header">Delete Booking</h2>
          <div className="edm-divider" />
          <p className="edm-confirm-text">Are you sure you want to delete this event?</p>
          <div className="edm-divider" />
          <div className="edm-actions">
            <button className="edm-btn-edit" onClick={onDelete}>Delete</button>
            <button className="edm-btn-close" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="edm-overlay">
      <div className="edm-modal">
        <div className="edm-header-row">
          <h2 className="edm-header">Event Details</h2>
          {seriesInfo && (
            <span className="edm-series-badge" title={`This is occurrence ${seriesInfo.position} of ${seriesInfo.total} in the series`}>
              🔁 {seriesInfo.position} / {seriesInfo.total}
            </span>
          )}
        </div>
        <div className="edm-divider" />

        <div className="edm-body">
          <div className="edm-row">
            <span className="edm-label">Title:</span>
            <span className="edm-value">{title}</span>
          </div>
          <div className="edm-row">
            <span className="edm-label">Booked By:</span>
            <span className="edm-value">{bookedBy}</span>
          </div>
          <div className="edm-row">
            <span className="edm-label">Time:</span>
            <span className="edm-value">{timeRange}</span>
          </div>
          <div className="edm-row">
            <span className="edm-label">Description:</span>
            {description
              ? <span className="edm-value edm-description" dangerouslySetInnerHTML={{ __html: description }} />
              : <span className="edm-value edm-value--empty">No description provided</span>
            }
          </div>
          {lastEditedBy && (
            <div className="edm-row edm-row--edited">
              <span className="edm-label">Last Edited By:</span>
              <span className="edm-value edm-edited-by">
                ✏️ {lastEditedBy}
                {lastEditedAt && <span className="edm-edited-at"> · {formatEditedAt(lastEditedAt)}</span>}
              </span>
            </div>
          )}
        </div>

        <div className="edm-divider" />

        <div className="edm-actions">
          {canEdit || canDelete ? (
            <>
              {canEdit && <button className="edm-btn-edit" onClick={onEdit}>Edit</button>}
              {canDelete && (
                <button
                  className="edm-btn-delete"
                  onClick={() => isRecurring ? onDelete() : setConfirmDelete(true)}
                >
                  Delete
                </button>
              )}
              <button className="edm-btn-close" onClick={onClose}>Close</button>
            </>
          ) : (
            <button className="edm-btn-gold-full" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  )
}
