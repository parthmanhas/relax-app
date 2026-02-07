import { useState, useCallback, useEffect } from 'react'
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, Timestamp, where } from 'firebase/firestore'
import { signInWithPopup, onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { db, auth, googleProvider } from './firebase'
import { QuotesSidebar } from './components/QuotesSidebar'
import './App.css'

interface HistoryItem {
  id: string;
  count: number;
  timestamp: Timestamp;
  userId: string;
}

const isLoggingEnabled = import.meta.env.VITE_ENABLE_LOGS === 'true';

const debugError = (message: string, error?: unknown) => {
  if (isLoggingEnabled) {
    console.error(message, error);
  }
};

function App() {
  const [count, setCount] = useState(0)
  const [bump, setBump] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
    })
    return () => unsubscribe()
  }, [])

  // Theme Management
  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark-mode')
      localStorage.setItem('theme', 'dark')
    } else {
      document.body.classList.remove('dark-mode')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  // Fetch History (User-specific)
  const [dailyStats, setDailyStats] = useState<{ date: string; count: number }[]>([])

  const fetchHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      setDailyStats([]);
      return;
    }
    try {
      // 1. Get the 3 most recent sessions for the detailed list
      const qRecent = query(
        collection(db, 'history'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(3)
      );
      const querySnapshotRecent = await getDocs(qRecent);
      const docsRecent = querySnapshotRecent.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryItem[];
      setHistory(docsRecent);

      // 2. Get ALL sessions to calculate daily stats (Compressed History per day)
      const qAll = query(
        collection(db, 'history'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc')
      );
      const querySnapshotAll = await getDocs(qAll);

      const statsMap: { [key: string]: number } = {};
      querySnapshotAll.docs.forEach(doc => {
        const data = doc.data();
        if (data.timestamp) {
          const date = data.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          statsMap[date] = (statsMap[date] || 0) + 1;
        }
      });

      const statsArray = Object.entries(statsMap)
        .map(([date, count]) => ({ date, count }))
        .slice(0, 3); // Only show last 3 days for brevity

      setDailyStats(statsArray);

    } catch (e) {
      debugError("Error fetching history: ", e);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      debugError("Login Error: ", e)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      setCount(0)
    } catch (e) {
      debugError("Logout Error: ", e)
    }
  }

  const handleIncrement = useCallback(() => {
    setCount((prev) => prev + 1)
    setBump(true)
    setTimeout(() => setBump(false), 300)

    if (window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
  }, [])

  const handleReset = useCallback(() => {
    setCount(0);
  }, []);

  const handleSave = async () => {
    if (count === 0 || !user) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'history'), {
        count: count,
        timestamp: serverTimestamp(),
        userId: user.uid
      });
      setCount(0);
      fetchHistory();
    } catch (e) {
      debugError("Error adding document: ", e);
      alert("Failed to save. Please ensure 'history' collection is set up in Firestore with proper rules.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    document.title = 'relax'
  }, [])

  return (
    <>
      <div className="background-overlay"></div>
      <QuotesSidebar side="left" />
      <QuotesSidebar side="right" />
      <main className="container">
        <div className="glass-card">
          <div className="card-header">
            <button
              className="theme-toggle"
              onClick={() => setIsDark(!isDark)}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {user ? (
              <div className="user-info">
                <img src={user.photoURL || ''} alt="" className="user-avatar" />
                <button className="auth-btn logout-btn" onClick={handleLogout} title="Logout">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                </button>
              </div>
            ) : (
              <button className="auth-btn login-btn" onClick={handleLogin} aria-label="Login with Google">
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </button>
            )}
          </div>

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

          <div className="action-buttons">
            <button
              className="action-btn reset-btn"
              onClick={handleReset}
              disabled={count === 0}
            >
              Reset
            </button>

            <button
              className="plus-btn"
              onClick={handleIncrement}
              aria-label="Add relaxation count"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              className="action-btn save-btn"
              onClick={handleSave}
              disabled={count === 0 || isSaving || !user}
              title={!user ? "Login to save your sessions" : ""}
            >
              {isSaving ? '...' : (user ? 'Save' : 'Save')}
            </button>
          </div>

          <div className="history-section">
            {user && dailyStats.length > 0 && (
              <div className="daily-summary">
                <h3 className="history-title">Daily Logs</h3>
                <div className="daily-stats-grid">
                  {dailyStats.map((stat) => (
                    <div key={stat.date} className="daily-stat-badge">
                      <span className="stat-date">{stat.date}</span>
                      <span className="stat-count">{stat.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="history-header">
              <h3 className="history-title">{user ? "Recent Details" : "Session History"}</h3>
            </div>

            <div className="history-list">
              {!user ? (
                <p className="no-history">Login to see your history</p>
              ) : history.length > 0 ? (
                history.map((item) => (
                  <div key={item.id} className="history-item">
                    <span className="history-count">{item.count}</span>
                    <span className="history-date">
                      {item.timestamp?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="no-history">No sessions saved yet</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

export default App
