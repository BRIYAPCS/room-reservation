import './ForcedLogoutBanner.css'

export default function ForcedLogoutBanner({ name, onDismiss }) {
  return (
    <div className="flb-wrap" role="alert">
      <span className="flb-icon">🔒</span>
      <div className="flb-body">
        <p className="flb-title">Signed out from all devices</p>
        <p className="flb-sub">
          {name ? `Hi ${name}, your` : 'Your'} session was ended from another device.
        </p>
      </div>
      <button className="flb-ok" onClick={onDismiss}>OK</button>
    </div>
  )
}
