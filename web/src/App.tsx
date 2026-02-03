import { useState, useCallback, useEffect } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [bump, setBump] = useState(false)

  const handleIncrement = useCallback(() => {
    setCount((prev) => prev + 1)
    setBump(true)
    setTimeout(() => setBump(false), 300)

    // Haptic feedback
    if (window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
  }, [])

  // Update document title for the browser tab
  useEffect(() => {
    document.title = 'relax'
  }, [])

  return (
    <>
      <div className="background-overlay"></div>
      <main className="container">
        <div className="glass-card">



          <div className="main-word-area">
            <p>repeat the word</p>
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
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </main>
    </>
  )
}

export default App
