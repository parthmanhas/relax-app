import { useState, useCallback, useEffect } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [bump, setBump] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark-mode')
      localStorage.setItem('theme', 'dark')
    } else {
      document.body.classList.remove('dark-mode')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  const handleIncrement = useCallback(() => {
    setCount((prev) => prev + 1)
    setBump(true)
    setTimeout(() => setBump(false), 300)

    if (window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
  }, [])

  useEffect(() => {
    document.title = 'relax'
  }, [])

  return (
    <>
      <div className="background-overlay"></div>
      <main className="container">
        <div className="glass-card">
          <button
            className="theme-toggle"
            onClick={() => setIsDark(!isDark)}
            aria-label="Toggle theme"
          >
            {isDark ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <div className="main-word-area">
            <p className="instruction-text">repeat the word</p>
            <span className="relax-word">relax</span>
          </div>

          <div className="counter-container">
            <span className={`counter ${bump ? 'bump' : ''}`}>
              {count}
            </span>
            <p className="counter-label">Repeats</p>
          </div>

          <button
            className="plus-btn"
            onClick={handleIncrement}
            aria-label="Add relaxation count"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </main>
    </>
  )
}

export default App
