import { useState, useRef } from 'react'
import './SortModal.css'

/**
 * SortModal — drag-and-drop + arrow-button reordering for sites or rooms.
 *
 * Props:
 *  title   — modal heading string
 *  items   — [{ id, name }]  (current order)
 *  onSave  — async (orderedItems: [{ id, sort_order }]) => void
 *  onClose — () => void
 */
export default function SortModal({ title, items, onSave, onClose }) {
  const [list, setList]     = useState(items)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(null)
  const dragIndex = useRef(null)

  // ── Drag handlers ──────────────────────────────────────────
  function handleDragStart(i) {
    dragIndex.current = i
  }

  function handleDragOver(e, i) {
    e.preventDefault()
    setDragOver(i)
    if (dragIndex.current === null || dragIndex.current === i) return
    setList(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex.current, 1)
      next.splice(i, 0, moved)
      dragIndex.current = i
      return next
    })
  }

  function handleDragEnd() {
    dragIndex.current = null
    setDragOver(null)
  }

  // ── Arrow button handlers (mobile / accessibility) ─────────
  function moveUp(i) {
    if (i === 0) return
    setList(prev => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }

  function moveDown(i) {
    if (i === list.length - 1) return
    setList(prev => {
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  // ── Save ───────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      await onSave(list.map((item, index) => ({ id: item.id, sort_order: index })))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sm-modal">
        <div className="sm-header">
          <h2 className="sm-title">{title}</h2>
          <button className="sm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="sm-hint">
          <span className="sm-hint-icon">⠿</span> Drag to reorder &nbsp;·&nbsp; use arrows on mobile
        </p>

        <ul className="sm-list">
          {list.map((item, i) => (
            <li
              key={item.id}
              className={`sm-item${dragOver === i ? ' sm-item--over' : ''}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
            >
              <span className="sm-handle" aria-hidden="true">⠿</span>
              <span className="sm-name">{item.name}</span>
              <div className="sm-arrows">
                <button
                  className="sm-arrow"
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  aria-label={`Move ${item.name} up`}
                >▲</button>
                <button
                  className="sm-arrow"
                  onClick={() => moveDown(i)}
                  disabled={i === list.length - 1}
                  aria-label={`Move ${item.name} down`}
                >▼</button>
              </div>
            </li>
          ))}
        </ul>

        <div className="sm-actions">
          <button className="sm-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="sm-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
