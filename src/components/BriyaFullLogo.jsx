import logo from '../assets/briya-logo-full.png'

export default function BriyaFullLogo({ className = '' }) {
  return (
    <img
      src={logo}
      alt="Briya Public Charter School"
      className={`briya-full-logo ${className}`}
      draggable={false}
    />
  )
}
