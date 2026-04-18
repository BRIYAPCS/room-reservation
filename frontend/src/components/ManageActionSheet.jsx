import './ManageActionSheet.css'

/**
 * Bottom action sheet for mobile manage-mode taps.
 *
 * Props:
 *  name      — card name shown in the header
 *  onEdit    — () => void
 *  onDelete  — () => void
 *  onClose   — () => void
 */
export default function ManageActionSheet({ name, onEdit, onDelete, onClose }) {
  return (
    <div className="mas-overlay">
      <div className="mas-sheet">
        <div className="mas-handle" />
        <p className="mas-name">{name}</p>
        <button className="mas-btn mas-btn--edit" onClick={() => { onClose(); onEdit() }}>
          ✎ Edit
        </button>
        <button className="mas-btn mas-btn--delete" onClick={() => { onClose(); onDelete() }}>
          ✕ Remove
        </button>
        <button className="mas-btn mas-btn--cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
