import { useState } from 'react'
import './AddRoomModal.css' // reuse same modal styles

/**
 * Generic edit modal for site or room cards.
 *
 * mode='site'  — fields: name, code
 * mode='room'  — fields: name, capacity
 */
export default function EditCardModal({ mode, initialValues, onSave, onClose }) {
  const [form, setForm]     = useState(initialValues)
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const isSite = mode === 'site'

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: name === 'code' ? value.toUpperCase() : value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name?.trim()) { setError('Name is required.'); return }
    if (isSite && form.code && !/^[A-Z0-9_-]+$/.test(form.code)) {
      setError('Code may only contain letters, numbers, hyphens, and underscores.')
      return
    }
    const cap = parseInt(form.capacity, 10)
    if (!isSite && form.capacity !== '' && (isNaN(cap) || cap < 0)) {
      setError('Capacity must be a positive number.')
      return
    }

    setSaving(true)
    try {
      await onSave(
        isSite
          ? { name: form.name.trim(), code: form.code?.trim() || undefined }
          : { name: form.name.trim(), capacity: cap || 0 }
      )
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="arm-overlay">
      <div className="arm-modal">
        <div className="arm-header">
          <h2 className="arm-title">Edit {isSite ? 'Site' : 'Room'}</h2>
          <button className="arm-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="arm-form" style={{ paddingTop: 18 }}>
          <label className="arm-label">
            {isSite ? 'Site' : 'Room'} Name <span className="arm-required">*</span>
            <input
              name="name"
              className="arm-input"
              value={form.name}
              onChange={handleChange}
              autoFocus
            />
          </label>

          {isSite && (
            <label className="arm-label">
              Site Code <span className="arm-optional">(leave blank to keep current)</span>
              <input
                name="code"
                className="arm-input"
                value={form.code}
                onChange={handleChange}
                maxLength={20}
                placeholder="e.g. FT"
              />
            </label>
          )}

          {!isSite && (
            <label className="arm-label">
              Capacity <span className="arm-optional">(optional)</span>
              <input
                name="capacity"
                className="arm-input"
                type="number"
                min="0"
                value={form.capacity}
                onChange={handleChange}
                placeholder="e.g. 30"
              />
            </label>
          )}

          {error && <p className="arm-error">{error}</p>}

          <div className="arm-actions">
            <button type="button" className="arm-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="arm-btn-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
