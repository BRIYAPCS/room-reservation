import { useEffect, useRef, useState } from 'react'
import { getAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl } from '../services/api'
import './AttachmentSection.css'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mimeType) {
  if (!mimeType) return '📎'
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('word')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType.startsWith('audio/')) return '🎵'
  return '📎'
}

export default function AttachmentSection({ reservationId, readOnly = false }) {
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!reservationId) return
    getAttachments(reservationId)
      .then(setAttachments)
      .catch(() => setAttachments([]))
  }, [reservationId])

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setError('')
    try {
      const newAttachment = await uploadAttachment(reservationId, file)
      setAttachments(prev => [...prev, newAttachment])
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteAttachment(id)
      setAttachments(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      setError(err.message || 'Delete failed')
    }
  }

  return (
    <div className="att-section">
      <div className="att-header">
        <span className="att-label">Attachments</span>
        {!readOnly && (
          <>
            <button
              type="button"
              className="att-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : '+ Add File'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      {error && <p className="att-error">{error}</p>}

      {attachments.length === 0 ? (
        <p className="att-empty">{readOnly ? 'No attachments.' : 'No attachments yet.'}</p>
      ) : (
        <ul className="att-list">
          {attachments.map(a => (
            <li key={a.id} className="att-item">
              <span className="att-icon">{fileIcon(a.mime_type)}</span>
              <span className="att-name" title={a.original_name}>{a.original_name}</span>
              {a.file_size && <span className="att-size">{formatBytes(a.file_size)}</span>}
              <a
                className="att-open-btn"
                href={getAttachmentUrl(a.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
              {!readOnly && (
                <button
                  type="button"
                  className="att-delete-btn"
                  onClick={() => handleDelete(a.id)}
                  title="Remove attachment"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
