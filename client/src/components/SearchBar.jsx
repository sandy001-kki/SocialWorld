import { useState } from 'react'

export default function SearchBar({ onSearch }) {
  const [value, setValue] = useState('')

  const submit = e => {
    if (e.key === 'Enter' && value.trim()) {
      onSearch(value.trim())
      setValue('')
    }
  }

  return (
    <div className="search-bar">
      {/* Search icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        placeholder="Search @username…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={submit}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  )
}
