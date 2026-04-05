import { Link } from 'react-router-dom'
import briyaIcon from '/briya_logo.png'
import './Breadcrumb.css'

/**
 * items — array of { label, path? }
 *   - items with a path are rendered as clickable links
 *   - the last item (no path) is the current page (non-clickable)
 * variant — 'on-blue' | 'on-white'
 */
export default function Breadcrumb({ items, variant = 'on-white' }) {
  return (
    <nav className={`breadcrumb breadcrumb--${variant}`} aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={i} className="breadcrumb-item">
              {i > 0 && (
                <span className="breadcrumb-sep" aria-hidden="true">›</span>
              )}
              {!isLast && item.path ? (
                <Link to={item.path} className="breadcrumb-link">
                  {i === 0 && (
                    <svg className="breadcrumb-home-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 1.5L1 7.5V14h5v-3.5h4V14h5V7.5L8 1.5z"/>
                    </svg>
                  )}
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumb-current" aria-current="page">
                  <img src={briyaIcon} alt="" className="breadcrumb-briya-icon" aria-hidden="true" />
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
