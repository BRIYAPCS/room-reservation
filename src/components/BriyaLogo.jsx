import './BriyaLogo.css'

export default function BriyaLogo({ size = 50 }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}briya_logo.png`}
      alt="Briya logo"
      width={size}
      height={size}
      className="briya-logo-animated"
      draggable={false}
    />
  )
}
