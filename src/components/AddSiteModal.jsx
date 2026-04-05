import { useState } from 'react'
import './AddRoomModal.css' // same style — identical layout

export default function AddSiteModal({ onSave, onClose }) {
  const [form, setForm]     = useState({ name: '', code: '' })
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    // Auto-uppercase code field
    setForm(prev => ({ ...prev, [name]: name === 'code' ? value.toUpperCase() : value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Site name is required.'); return }
    if (form.code && !/^[A-Z0-9_-]+$/.test(form.code)) {
      setError('Code may only contain letters, numbers, hyphens, and underscores.')
      return
    }

    setSaving(true)
    try {
      await onSave({ name: form.name.trim(), code: form.code.trim() || undefined })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create site.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="arm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="arm-modal">
        <div className="arm-header">
          <h2 className="arm-title">Add Site</h2>
          <button className="arm-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="arm-form" style={{ paddingTop: 18 }}>
          <label className="arm-label">
            Site Name <span className="arm-required">*</span>
            <input
              name="name"
              className="arm-input"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. New Site"
              autoFocus
            />
          </label>

          <label className="arm-label">
            Site Code <span className="arm-optional">(optional — auto-generated if blank)</span>
            <input
              name="code"
              className="arm-input"
              value={form.code}
              onChange={handleChange}
              placeholder="e.g. NS"
              maxLength={20}
            />
          </label>

          {error && <p className="arm-error">{error}</p>}

          <div className="arm-actions">
            <button type="button" className="arm-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="arm-btn-save" disabled={saving}>
              {saving ? 'Adding…' : 'Add Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
