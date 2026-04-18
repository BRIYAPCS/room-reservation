import './ClearableInput.css'

/**
 * ClearableInput — a controlled text input that shows an ✕ button
 * inside the field whenever there is a non-empty value.
 *
 * Props:
 *   All standard <input> props are forwarded.  Extra props below:
 *   - wrapperClassName  extra class added to the outer wrapper div
 *
 * The clear handler fires onChange({ target: { name, value: '', type } })
 * so it works with handlers that read e.target.name (e.g. handleChange in
 * BookingModal / EditBookingModal).
 */
export default function ClearableInput({
  value,
  onChange,
  disabled,
  readOnly,
  className = '',
  name = '',
  type = 'text',
  wrapperClassName = '',
  ...rest
}) {
  const showClear = !!value && !disabled && !readOnly

  function handleClear() {
    onChange({ target: { name, value: '', type } })
  }

  return (
    <div className={`ci-wrap${wrapperClassName ? ' ' + wrapperClassName : ''}`}>
      <input
        value={value}
        onChange={onChange}
        disabled={disabled}
        readOnly={readOnly}
        className={`${className}${showClear ? ' ci-has-clear' : ''}`}
        name={name}
        type={type}
        {...rest}
      />
      {showClear && (
        <button
          type="button"
          className="ci-clear-btn"
          onMouseDown={e => e.preventDefault()} // prevent blur before clear fires
          onClick={handleClear}
          tabIndex={-1}
          aria-label="Clear"
        >
          ✕
        </button>
      )}
    </div>
  )
}
