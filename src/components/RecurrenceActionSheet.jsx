import './RecurrenceActionSheet.css'

/**
 * Shown when a user clicks Edit or Delete on a recurring event.
 * Offers up to three scopes: this only / this and following / all.
 *
 * Props:
 *   action          — 'edit' | 'delete'
 *   recurrenceIndex — index of the clicked occurrence (0 = first in series)
 *   onChoose        — (scope) => void   scope: 'this' | 'following' | 'all'
 *   onClose         — () => void
 */
export default function RecurrenceActionSheet({ action, recurrenceIndex, onChoose, onClose }) {
  // "This and following" on the first event equals "All" — hide it to avoid confusion
  const isFirst = (recurrenceIndex ?? 0) === 0
  const isDelete = action === 'delete'

  const verb   = isDelete ? 'Delete' : 'Edit'
  const accent = isDelete ? 'ras-btn--danger' : 'ras-btn--primary'

  const options = [
    {
      scope: 'this',
      label: `${verb} this event only`,
      desc:  'Only this single occurrence is affected.',
      show:  true,
    },
    {
      scope: 'following',
      label: `${verb} this and following events`,
      desc:  'This occurrence and all that come after it.',
      show:  !isFirst, // hidden when clicking the first event in the series
    },
    {
      scope: 'all',
      label: `${verb} all events in series`,
      desc:  'Every occurrence in the entire series.',
      show:  true,
    },
  ].filter(o => o.show)

  return (
    <div className="ras-overlay" onClick={onClose}>
      <div className="ras-sheet" onClick={e => e.stopPropagation()}>
        <div className="ras-header">
          <span className="ras-icon">{isDelete ? '🗑️' : '✏️'}</span>
          <div>
            <p className="ras-title">{verb} Recurring Event</p>
            <p className="ras-subtitle">How much of the series would you like to {action.toLowerCase()}?</p>
          </div>
          <button className="ras-close" onClick={onClose}>✕</button>
        </div>

        <div className="ras-options">
          {options.map(opt => (
            <button
              key={opt.scope}
              className={`ras-btn ${accent}`}
              onClick={() => onChoose(opt.scope)}
            >
              <span className="ras-btn-label">{opt.label}</span>
              <span className="ras-btn-desc">{opt.desc}</span>
            </button>
          ))}
        </div>

        <button className="ras-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
