import { useState } from 'react'
import './AddRoomModal.css'

export default function AddRoomModal({ siteName, onSave, onClose }) {
  const [form, setForm]     = useState({ name: '', capacity: '' })
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Room name is required.'); return }
    const cap = parseInt(form.capacity, 10)
    if (form.capacity && (isNaN(cap) || cap < 0)) { setError('Capacity must be a positive number.'); return }

    setSaving(true)
    try {
      await onSave({ name: form.name.trim(), capacity: cap || 0 })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create room.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="arm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="arm-modal">
        <div className="arm-header">
          <h2 className="arm-title">Add Room</h2>
          <button className="arm-close" onClick={onClose}>✕</button>
        </div>
        <p className="arm-site-label">Site: <strong>{siteName}</strong></p>

        <form onSubmit={handleSubmit} className="arm-form">
          <label className="arm-label">
            Room Name <span className="arm-required">*</span>
            <input
              name="name"
              className="arm-input"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. GA Classroom 12"
              autoFocus
            />
          </label>

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

          {error && <p className="arm-error">{error}</p>}

          <div className="arm-actions">
            <button type="button" className="arm-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="arm-btn-save" disabled={saving}>
              {saving ? 'Adding…' : 'Add Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
