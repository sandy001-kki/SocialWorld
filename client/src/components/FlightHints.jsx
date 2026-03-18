export default function FlightHints({ driveMode }) {
  const planeHints = [
    { keys: ['W', 'S'],   label: 'Throttle' },
    { keys: ['A', 'D'],   label: 'Turn' },
    { keys: ['↑', '↓'],   label: 'Pitch' },
    { keys: ['Q', 'E'],   label: 'Altitude' },
    { keys: ['Click'],    label: 'Open profile' },
  ]
  const carHints = [
    { keys: ['W'],        label: 'Accelerate' },
    { keys: ['S'],        label: 'Brake / Reverse' },
    { keys: ['A', 'D'],   label: 'Steer' },
  ]
  const hints = driveMode ? carHints : planeHints

  return (
    <div className="flight-hints">
      <h4>{driveMode ? '🚗 Car Controls' : '✈ Flight Controls'}</h4>
      {hints.map(({ keys, label }) => (
        <div className="hint-row" key={label}>
          <span>{keys.map(k => <span key={k} className="hint-key">{k}</span>)}</span>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}
