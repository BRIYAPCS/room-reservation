import { useRef, useState, useEffect } from 'react'
import './RichTextEditor.css'

const HIGHLIGHT_COLORS = [
  { color: '#fff176', label: 'Yellow' },
  { color: '#a5d6a7', label: 'Green' },
  { color: '#90caf9', label: 'Blue' },
  { color: '#ef9a9a', label: 'Red' },
  { color: '#ce93d8', label: 'Purple' },
]

const TEXT_COLORS = [
  { color: '#000000', label: 'Black' },
  { color: '#1a3557', label: 'Navy' },
  { color: '#1186c4', label: 'Blue' },
  { color: '#1a7a4a', label: 'Green' },
  { color: '#c0392b', label: 'Red' },
  { color: '#e07b2a', label: 'Orange' },
  { color: '#7d3c98', label: 'Purple' },
  { color: '#888888', label: 'Gray' },
]

const TOOLBAR = [
  { cmd: 'bold',                label: <b>B</b>,  title: 'Bold (Ctrl+B)' },
  { cmd: 'italic',              label: <i>I</i>,  title: 'Italic (Ctrl+I)' },
  { cmd: 'underline',           label: <u>U</u>,  title: 'Underline (Ctrl+U)' },
  { sep: true },
  { cmd: 'insertUnorderedList', label: '≡',       title: 'Bullet list' },
  { cmd: 'insertOrderedList',   label: '1.',      title: 'Numbered list' },
  { sep: true },
  { cmd: 'textColor',           label: <span className="rte-text-color-icon">A</span>, title: 'Text color' },
  { cmd: 'highlight',           label: '🖍',      title: 'Highlight text' },
  { cmd: 'removeBg',            label: <span className="rte-no-bg-icon"><span>A</span><span className="rte-no-bg-slash"/></span>, title: 'Remove background color' },
  { cmd: 'link',                label: '🔗',      title: 'Insert / edit link (Ctrl+K)' },
  { cmd: 'removeFormat',        label: '✕',      title: 'Clear formatting' },
]

const URL_REGEX = /^(https?:\/\/|www\.)[^\s]{2,}$/i

function isUrl(str) { return URL_REGEX.test(str.trim()) }

function toHref(str) {
  const s = str.trim()
  return s.startsWith('http') ? s : `https://${s}`
}

// ── Known service recognizers ─────────────────────────────────
// Each entry: { test(hostname) → bool, label(url) → string }
const SERVICE_PATTERNS = [
  // SharePoint — /:b:/ = PDF, /:w:/ = Word, /:x:/ = Excel, etc.
  {
    test:  h => h.includes('sharepoint.com'),
    label: url => {
      const TYPE_MAP = {
        ':b:': 'PDF', ':w:': 'Word Document', ':x:': 'Excel Spreadsheet',
        ':p:': 'PowerPoint', ':v:': 'Video', ':f:': 'Folder', ':i:': 'Image',
      }
      const parts    = url.pathname.split('/')
      const typeCode = parts.find(p => /^:[a-z]:$/i.test(p))?.toLowerCase()
      const fileType = TYPE_MAP[typeCode] || 'Document'
      // /s/<site-name>/ segment gives a human-readable site label
      const sIdx = parts.indexOf('s')
      const site = sIdx !== -1 && parts[sIdx + 1]
        ? decodeURIComponent(parts[sIdx + 1]).replace(/[_-]/g, ' ')
        : ''
      return site ? `SharePoint ${fileType} (${site})` : `SharePoint ${fileType}`
    },
  },
  { test: h => h.includes('onedrive.com') || h.includes('1drv.ms'),           label: () => 'OneDrive File' },
  { test: h => h.includes('docs.google.com'), label: url => {
      if (url.pathname.includes('/document/'))     return 'Google Doc'
      if (url.pathname.includes('/spreadsheets/')) return 'Google Sheet'
      if (url.pathname.includes('/presentation/')) return 'Google Slides'
      if (url.pathname.includes('/forms/'))        return 'Google Form'
      return 'Google Docs'
    },
  },
  { test: h => h.includes('drive.google.com'),                                 label: () => 'Google Drive' },
  { test: h => h.includes('youtube.com') || h.includes('youtu.be'),           label: () => 'YouTube Video' },
  { test: h => h.includes('zoom.us'),                                          label: () => 'Zoom Meeting' },
  { test: h => h.includes('teams.microsoft.com') || h.includes('teams.live.com'), label: () => 'Microsoft Teams' },
  { test: h => h.includes('meet.google.com'),                                  label: () => 'Google Meet' },
  { test: h => h.includes('github.com') || h.includes('github.io'),           label: () => 'GitHub' },
  { test: h => h.includes('dropbox.com'),                                      label: () => 'Dropbox' },
  { test: h => h.includes('forms.office.com') || h.includes('forms.microsoft.com'), label: () => 'Microsoft Form' },
  { test: h => h.includes('canva.com'),                                        label: () => 'Canva' },
  { test: h => h.includes('figma.com'),                                        label: () => 'Figma' },
  { test: h => h.includes('miro.com'),                                         label: () => 'Miro Board' },
]

// Set of generic TLDs — the segment before these is the brand name
const GENERIC_TLDS = new Set(['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'us', 'uk', 'ca', 'au'])

function linkLabel(rawStr) {
  try {
    const url      = new URL(toHref(rawStr.trim()))
    const hostname = url.hostname.replace(/^www\./, '')

    // Check known services first
    for (const svc of SERVICE_PATTERNS) {
      if (svc.test(hostname)) return svc.label(url)
    }

    // Generic: capitalize the primary brand segment of the domain
    // e.g. "google.com" → parts[-2] = "google" → "Google"
    //      "briyapcs.github.io" → tld=io → parts[-2]="github" → "GitHub"
    const parts    = hostname.split('.')
    const tld      = parts[parts.length - 1]
    const mainPart = parts.length >= 2 && GENERIC_TLDS.has(tld)
      ? parts[parts.length - 2]
      : parts[0]
    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1)
  } catch {
    return rawStr.trim()
  }
}

// Returns the nearest <a> ancestor of the current cursor position, or null
function getActiveLink() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node = sel.getRangeAt(0).startContainer
  while (node && node.nodeType !== 1) node = node.parentNode
  return node?.closest?.('a') || null
}

export default function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef    = useRef(null)
  const skipSync     = useRef(false)
  const savedRange   = useRef(null)   // selection snapshot before popover opens
  const initialized  = useRef(false)

  // Link popover state
  const [popover, setPopover] = useState(null)   // null | { mode: 'insert'|'edit', url, text, isExisting }
  const [linkPreview, setLinkPreview] = useState(null)  // null | { url, element }
  const [showHighlight, setShowHighlight] = useState(false)
  const [showTextColor, setShowTextColor] = useState(false)

  // Set HTML on first mount only; after that only respond to external resets (empty string)
  useEffect(() => {
    if (!editorRef.current) return
    if (!initialized.current) {
      // First render — load initial value (e.g. editing an existing booking)
      editorRef.current.innerHTML = value || ''
      initialized.current = true
      return
    }
    // Allow external reset (e.g. form clear after save)
    if (value === '') {
      editorRef.current.innerHTML = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Close popovers on outside click
  useEffect(() => {
    if (!popover && !linkPreview && !showHighlight && !showTextColor) return
    function onDown(e) {
      if (!e.target.closest('.rte-popover') && !e.target.closest('.rte-link-preview') && !e.target.closest('.rte-btn') && !e.target.closest('.rte-highlight-wrap')) {
        setPopover(null)
        setLinkPreview(null)
        setShowHighlight(false)
        setShowTextColor(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popover, linkPreview, showHighlight, showTextColor])

  // ── Exec helpers ──────────────────────────────────────────────
  function exec(cmd, val = null) {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    skipSync.current = true
    onChange(editorRef.current.innerHTML)
    skipSync.current = false
  }

  function notifyChange() {
    skipSync.current = true
    onChange(editorRef.current.innerHTML)
    skipSync.current = false
  }

  // Restore the saved selection so execCommand targets the right range
  function restoreSelection() {
    if (!savedRange.current) return
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(savedRange.current)
  }

  // ── Open link popover ─────────────────────────────────────────
  function openLinkPopover() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
    const existingLink = getActiveLink()
    if (existingLink) {
      setPopover({
        mode: 'edit',
        url:  existingLink.href,
        text: existingLink.textContent,
        isExisting: true,
      })
    } else {
      const selectedText = sel?.toString() || ''
      setPopover({
        mode: 'insert',
        url:  '',
        text: selectedText,
        isExisting: false,
      })
    }
  }

  // ── Apply / update link ───────────────────────────────────────
  function applyLink(url, text) {
    if (!url) return
    const href = url.startsWith('http') ? url : `https://${url}`
    restoreSelection()
    editorRef.current.focus()

    const existingLink = getActiveLink()
    if (existingLink) {
      // Update existing link in-place
      existingLink.href = href
      if (text) existingLink.textContent = text
    } else {
      const sel = window.getSelection()
      const hasSelection = sel && !sel.isCollapsed
      if (hasSelection) {
        document.execCommand('createLink', false, href)
        // Set target="_blank" on the newly created link
        const newLink = getActiveLink()
        if (newLink) {
          newLink.target = '_blank'
          newLink.rel = 'noopener noreferrer'
        }
      } else {
        const label = text || href
        document.execCommand(
          'insertHTML', false,
          `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
        )
      }
    }
    notifyChange()
    setPopover(null)
  }

  // ── Remove link ───────────────────────────────────────────────
  function removeLink() {
    restoreSelection()
    editorRef.current.focus()
    const link = getActiveLink()
    if (link) {
      // Replace <a> with its text content
      const text = document.createTextNode(link.textContent)
      link.replaceWith(text)
      notifyChange()
    }
    setPopover(null)
  }

  // ── Auto-linkify a raw URL string at the current cursor ───────
  function linkifyWord(word) {
    const href  = toHref(word)
    const label = linkLabel(word)
    document.execCommand(
      'insertHTML', false,
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
    )
    notifyChange()
  }

  // ── Paste: handle bare URLs (images go through attachment section) ──
  function handlePaste(e) {
    // Block image pastes — use the Attachments section instead
    const items = Array.from(e.clipboardData?.items || [])
    if (items.some(it => it.type.startsWith('image/'))) {
      e.preventDefault()
      return
    }

    // Plain-text URL → auto-linkify
    const plain = e.clipboardData?.getData('text/plain') || ''
    if (isUrl(plain)) {
      e.preventDefault()
      editorRef.current.focus()
      linkifyWord(plain)
    }
    // Otherwise let the browser handle rich / plain paste normally
  }

  // ── Space / Enter after typing a URL → convert to link ────────
  function handleKeyUp(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    // Walk back through the text node to find the word just completed
    const range = sel.getRangeAt(0)
    const node  = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return

    const text   = node.textContent.slice(0, range.startOffset)
    const words  = text.split(/\s/)
    const word   = words[words.length - 1] || words[words.length - 2] || ''
    if (!isUrl(word)) return

    // Select only the word and replace it with an <a>
    const wordStart = range.startOffset - word.length - 1  // -1 for the space/enter
    const wordRange = document.createRange()
    wordRange.setStart(node, Math.max(0, wordStart))
    wordRange.setEnd(node, wordStart + word.length)

    const sel2 = window.getSelection()
    sel2.removeAllRanges()
    sel2.addRange(wordRange)

    linkifyWord(word)

    // Move cursor to end of inserted link
    const updatedSel = window.getSelection()
    if (updatedSel && updatedSel.rangeCount > 0) {
      const r = updatedSel.getRangeAt(0)
      r.collapse(false)
    }
  }

  // ── Remove all background colors from selection ───────────────
  function removeBgColor() {
    editorRef.current?.focus()
    // First use hiliteColor to clear highlight
    document.execCommand('hiliteColor', false, 'transparent')
    // Then walk every element in the editor and strip inline background-color
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      // If nothing selected, strip from whole editor
      const container = sel.isCollapsed ? editorRef.current : range.commonAncestorContainer
      const root = container.nodeType === 1 ? container : container.parentElement
      const targets = root === editorRef.current
        ? editorRef.current.querySelectorAll('[style*="background"]')
        : [root, ...root.querySelectorAll('[style*="background"]')]
      targets.forEach(el => {
        el.style.backgroundColor = ''
        el.style.background = ''
        if (!el.getAttribute('style')) el.removeAttribute('style')
      })
    }
    notifyChange()
  }

  // ── Editor events ─────────────────────────────────────────────
  function handleInput() { notifyChange() }

  function handleKeyDown(e) {
    // Prevent all key events from bubbling out of the editor
    e.stopPropagation()

    if (e.key === 'Tab') {
      e.preventDefault()
      document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      openLinkPopover()
    }
  }

  // Click on an existing link → show preview tooltip (open / edit / remove)
  function handleEditorClick(e) {
    if (e.target.tagName === 'A') {
      e.preventDefault()
      setLinkPreview({ url: e.target.href, element: e.target })
    }
  }

  function handlePreviewEdit() {
    setLinkPreview(null)
    openLinkPopover()
  }

  function handlePreviewRemove() {
    const link = linkPreview?.element
    if (link) {
      const text = document.createTextNode(link.textContent)
      link.replaceWith(text)
      notifyChange()
    }
    setLinkPreview(null)
  }

  return (
    <div className="rte-wrap" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
      <div className="rte-toolbar" onMouseDown={e => e.preventDefault()}>
        {TOOLBAR.map((item, i) =>
          item.sep
            ? <span key={i} className="rte-sep" />
            : item.cmd === 'textColor'
            ? (
              <div key={i} className="rte-highlight-wrap">
                <button
                  type="button"
                  className={`rte-btn${showTextColor ? ' rte-btn--active' : ''}`}
                  title={item.title}
                  onClick={() => setShowTextColor(v => !v)}
                >
                  {item.label}
                </button>
                {showTextColor && (
                  <div className="rte-highlight-picker">
                    {TEXT_COLORS.map(({ color, label }) => (
                      <button
                        key={color}
                        type="button"
                        className="rte-highlight-swatch"
                        style={{ background: color }}
                        title={label}
                        onClick={() => {
                          editorRef.current?.focus()
                          document.execCommand('foreColor', false, color)
                          notifyChange()
                          setShowTextColor(false)
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      className="rte-highlight-swatch rte-highlight-swatch--none"
                      title="Default color"
                      onClick={() => {
                        editorRef.current?.focus()
                        document.execCommand('foreColor', false, '#333333')
                        notifyChange()
                        setShowTextColor(false)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )
            : item.cmd === 'highlight'
            ? (
              <div key={i} className="rte-highlight-wrap">
                <button
                  type="button"
                  className={`rte-btn${showHighlight ? ' rte-btn--active' : ''}`}
                  title={item.title}
                  onClick={() => setShowHighlight(v => !v)}
                >
                  {item.label}
                </button>
                {showHighlight && (
                  <div className="rte-highlight-picker">
                    {HIGHLIGHT_COLORS.map(({ color, label }) => (
                      <button
                        key={color}
                        type="button"
                        className="rte-highlight-swatch"
                        style={{ background: color }}
                        title={label}
                        onClick={() => {
                          editorRef.current?.focus()
                          document.execCommand('hiliteColor', false, color)
                          notifyChange()
                          setShowHighlight(false)
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      className="rte-highlight-swatch rte-highlight-swatch--none"
                      title="Remove highlight"
                      onClick={() => {
                        editorRef.current?.focus()
                        document.execCommand('hiliteColor', false, 'transparent')
                        notifyChange()
                        setShowHighlight(false)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )
            : (
              <button
                key={i}
                type="button"
                className="rte-btn"
                title={item.title}
                onClick={() => {
                  if (item.cmd === 'link') { openLinkPopover(); return }
                  if (item.cmd === 'removeBg') { removeBgColor(); return }
                  exec(item.cmd)
                }}
              >
                {item.label}
              </button>
            )
        )}
      </div>

      {/* Link preview bar (click on existing link) */}
      {linkPreview && (
        <div className="rte-link-preview">
          <a
            href={linkPreview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rte-link-preview-url"
            title={linkPreview.url}
          >
            🔗 {linkPreview.url.length > 48 ? linkPreview.url.slice(0, 48) + '…' : linkPreview.url}
          </a>
          <div className="rte-link-preview-actions">
            <a
              href={linkPreview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rte-link-preview-btn"
              title="Open in new tab"
              onClick={() => setLinkPreview(null)}
            >
              ↗ Open
            </a>
            <button type="button" className="rte-link-preview-btn" onClick={handlePreviewEdit} title="Edit link">
              ✎ Edit
            </button>
            <button type="button" className="rte-link-preview-btn rte-link-preview-btn--remove" onClick={handlePreviewRemove} title="Remove link">
              ✕ Remove
            </button>
          </div>
        </div>
      )}

      {/* Link popover */}
      {popover && (
        <LinkPopover
          popover={popover}
          onChange={setPopover}
          onApply={applyLink}
          onRemove={removeLink}
          onClose={() => setPopover(null)}
        />
      )}

      <div
        ref={editorRef}
        className="rte-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        onClick={handleEditorClick}
        data-placeholder={placeholder || 'Optional'}
      />
    </div>
  )
}

function LinkPopover({ popover, onChange, onApply, onRemove, onClose }) {
  const urlRef = useRef(null)

  useEffect(() => { urlRef.current?.focus() }, [])

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); onApply(popover.url, popover.text) }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="rte-popover" onKeyDown={handleKeyDown}>
      <div className="rte-popover-header">
        <span>{popover.isExisting ? 'Edit Link' : 'Insert Link'}</span>
        <button type="button" className="rte-popover-x" onClick={onClose}>✕</button>
      </div>

      <label className="rte-popover-label">
        URL
        <input
          ref={urlRef}
          className="rte-popover-input"
          type="url"
          placeholder="https://example.com"
          value={popover.url}
          onChange={e => onChange(p => ({ ...p, url: e.target.value }))}
        />
      </label>

      {!popover.isExisting && (
        <label className="rte-popover-label">
          Display text <span className="rte-popover-hint">(leave blank to use URL)</span>
          <input
            className="rte-popover-input"
            type="text"
            placeholder="Link text"
            value={popover.text}
            onChange={e => onChange(p => ({ ...p, text: e.target.value }))}
          />
        </label>
      )}

      <div className="rte-popover-actions">
        <button
          type="button"
          className="rte-popover-btn rte-popover-btn--primary"
          onClick={() => onApply(popover.url, popover.text)}
        >
          {popover.isExisting ? 'Update' : 'Insert'}
        </button>
        {popover.isExisting && (
          <button
            type="button"
            className="rte-popover-btn rte-popover-btn--danger"
            onClick={onRemove}
          >
            Remove link
          </button>
        )}
        <button
          type="button"
          className="rte-popover-btn rte-popover-btn--cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
