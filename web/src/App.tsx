import { useState, useCallback, useEffect } from 'react'
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, Timestamp, where } from 'firebase/firestore'
import { signInWithPopup, onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { db, auth, googleProvider } from './firebase'
import { QuotesSidebar } from './components/QuotesSidebar'
import './App.css'

interface HistoryItem {
  id: string;
  count: number;
  word?: string;
  lostFocusCount?: number;
  timestamp: Timestamp;
  userId: string;
}

const WORDS = ['relax', 'dont think', 'dont care'] as const;
type WordType = typeof WORDS[number];

const isLoggingEnabled = import.meta.env.VITE_ENABLE_LOGS === 'true';

const debugError = (message: string, error?: unknown) => {
  if (isLoggingEnabled) {
    console.error(message, error);
  }
};

function App() {
  const [counts, setCounts] = useState<Record<WordType, number>>({
    'relax': 0,
    'dont think': 0,
    'dont care': 0
  })
  const [lostFocusCount, setLostFocusCount] = useState(0)
  const [currentWord, setCurrentWord] = useState<WordType>('relax')
  const [bump, setBump] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [heatmapData, setHeatmapData] = useState<{ date: string; count: number; dayIndex: number }[]>([])

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
  const fetchHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }
    try {
      // 1. Get the 3 most recent sessions for the detailed list
      const qRecent = query(
        collection(db, 'history'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      const querySnapshotRecent = await getDocs(qRecent);
      const docsRecent = querySnapshotRecent.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryItem[];
      setHistory(docsRecent);

      // 2. Fetch history for heatmap (Simplified to avoid index issues)
      const qHeatmap = query(
        collection(db, 'history'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(500)
      );

      const querySnapshotHeatmap = await getDocs(qHeatmap);
      const statsMap: Record<string, number> = {};

      const getLocalDateKey = (date: Date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      };

      querySnapshotHeatmap.docs.forEach(doc => {
        const data = doc.data();
        if (data.timestamp) {
          const dateKey = getLocalDateKey(data.timestamp.toDate());
          // Count sessions (number of entries), not the total repeats within them
          statsMap[dateKey] = (statsMap[dateKey] || 0) + 1;
        }
      });

      // Generate last 182 days (26 weeks) of data points
      const days: { date: string; count: number; dayIndex: number }[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Loop to include exactly 182 days ending with TODAY
      for (let i = 181; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateKey = getLocalDateKey(d);
        days.push({
          date: dateKey,
          count: statsMap[dateKey] || 0,
          dayIndex: d.getDay()
        });
      }
      setHeatmapData(days);

    } catch (e) {
      console.error("Heatmap Fetch Error:", e);
      debugError("Error fetching history: ", e);
    }
  }, [user]);

  const isToday = (timestamp: Timestamp) => {
    if (!timestamp) return false;
    const date = timestamp.toDate();
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const todaySessions = history.filter(item => isToday(item.timestamp));
  const pastSessions = history.filter(item => !isToday(item.timestamp));

  // Group past sessions by date
  const groupedPastSessions = pastSessions.reduce((groups, item) => {
    const date = item.timestamp?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(item);
    return groups;
  }, {} as Record<string, HistoryItem[]>);

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
      setCounts({
        'relax': 0,
        'dont think': 0,
        'dont care': 0
      })
      setLostFocusCount(0)
    } catch (e) {
      debugError("Logout Error: ", e)
    }
  }

  const handleIncrement = useCallback(() => {
    setCounts((prev) => ({
      ...prev,
      [currentWord]: prev[currentWord] + 1
    }))
    setBump(true)
    setTimeout(() => setBump(false), 300)

    if (window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
  }, [currentWord])

  const handleReset = useCallback(() => {
    setCounts((prev) => ({
      ...prev,
      [currentWord]: 0
    }));
    setLostFocusCount(0);
  }, [currentWord]);

  const handleLostFocus = useCallback(() => {
    setLostFocusCount(prev => prev + 1);
    if (window.navigator.vibrate) {
      window.navigator.vibrate([10, 50, 10]);
    }
  }, []);

  const handleSave = async () => {
    const currentCount = counts[currentWord];
    if (currentCount === 0 || !user) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'history'), {
        count: currentCount,
        word: currentWord,
        lostFocusCount: lostFocusCount,
        timestamp: serverTimestamp(),
        userId: user.uid
      });
      setCounts(prev => ({
        ...prev,
        [currentWord]: 0
      }));
      setLostFocusCount(0);
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

          <div className="word-toggle-container">
            <div className="word-toggle">
              {WORDS.map((w) => (
                <button
                  key={w}
                  className={`toggle-option ${currentWord === w ? 'active' : ''}`}
                  onClick={() => setCurrentWord(w)}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div className="main-word-area">
            <p className="instruction-text">repeat the word</p>
            <span className="relax-word">{currentWord}</span>
          </div>

          <div className="counter-container">
            <div className="main-counter">
              <span className={`counter ${bump ? 'bump' : ''}`}>
                {counts[currentWord]}
              </span>
              <p className="counter-label">Repeats</p>
            </div>
            {lostFocusCount > 0 && (
              <div className="lost-focus-badge" title="Lost Focus Count">
                <span className="lost-focus-count">{lostFocusCount}</span>
                <span className="lost-focus-label">Lost Focus</span>
              </div>
            )}
          </div>

          <div className="primary-action">
            <button
              className="plus-btn"
              onClick={handleIncrement}
              aria-label={`Increment ${currentWord} count`}
            >
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="action-buttons">
            <button
              className="action-btn reset-btn"
              onClick={handleReset}
              disabled={counts[currentWord] === 0 && lostFocusCount === 0}
              title="Reset session"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>

            <button
              className="action-btn lost-focus-btn"
              onClick={handleLostFocus}
              title="I'm distracted / lost focus"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>

            <button
              className="action-btn save-btn"
              onClick={handleSave}
              disabled={counts[currentWord] === 0 || isSaving || !user}
              title={!user ? "Login to save your sessions" : "Save session to history"}
            >
              {isSaving ? (
                <span className="loading-dots">...</span>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                </svg>
              )}
            </button>
          </div>

          <div className="history-section">
            <div className="heatmap-container">
              <div className="heatmap-header">
                <p className="group-label">Activity Heatmap</p>
                <div className="heatmap-legend">
                  <span>Less</span>
                  <div className="legend-cell level-0"></div>
                  <div className="legend-cell level-1"></div>
                  <div className="legend-cell level-2"></div>
                  <div className="legend-cell level-3"></div>
                  <div className="legend-cell level-4"></div>
                  <span>More</span>
                </div>
              </div>
              <div className="heatmap-grid">
                {heatmapData.length > 0 ? heatmapData.map((day) => {
                  let level = 0;
                  if (day.count > 0) {
                    if (day.count === 1) level = 1;
                    else if (day.count <= 3) level = 2;
                    else if (day.count <= 5) level = 3;
                    else level = 4;
                  }
                  return (
                    <div
                      key={day.date}
                      className={`heatmap-cell level-${level}`}
                      title={`${day.date}: ${day.count} sessions`}
                      style={{ gridRow: day.dayIndex + 1 }}
                    />
                  );
                }) : (
                  <div className="heatmap-loading">Loading activity...</div>
                )}
              </div>
            </div>

            <div className="history-header">
              <h3 className="history-title">{user ? "Recent Details" : "Session History"}</h3>
              {user && history.length > 0 && (
                <div className="total-sessions-badge">
                  <span className="badge-label">TOTAL SESSIONS:</span>
                  <span className="badge-value">{history.length}</span>
                </div>
              )}
            </div>

            <div className="history-list">
              {!user ? (
                <p className="no-history">Login to see your history</p>
              ) : history.length > 0 ? (
                <>
                  {todaySessions.length > 0 && (
                    <div className="history-group">
                      <p className="group-label">Today</p>
                      {todaySessions.map((item) => (
                        <div key={item.id} className="history-item">
                          <div className="history-info">
                            <div className="history-main-info">
                              <span className="history-count">{item.count}</span>
                              <span className="history-word">{item.word || 'relax'}</span>
                            </div>
                            {item.lostFocusCount !== undefined && item.lostFocusCount > 0 && (
                              <div className="history-lost-focus" title="Lost focus occurrences">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
                                </svg>
                                <span>{item.lostFocusCount}</span>
                              </div>
                            )}
                          </div>
                          <span className="history-date">
                            {item.timestamp?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {pastSessions.length > 0 && (
                    <div className="history-group past-sessions">
                      {!showAllHistory ? (
                        <button className="expand-history-btn" onClick={() => setShowAllHistory(true)}>
                          Show Past Sessions ({pastSessions.length})
                        </button>
                      ) : (
                        <>
                          <div className="group-header">
                            <p className="group-label">Earlier</p>
                            <button className="collapse-history-btn" onClick={() => setShowAllHistory(false)}>Hide</button>
                          </div>
                          {Object.entries(groupedPastSessions).map(([date, sessions]) => (
                            <div key={date} className="daily-group">
                              <div className="daily-group-header">
                                <span className="daily-group-date">{date}</span>
                                <span className="daily-group-count">{sessions.length} sessions</span>
                              </div>
                              {sessions.map((item) => (
                                <div key={item.id} className="history-item">
                                  <div className="history-info">
                                    <div className="history-main-info">
                                      <span className="history-count">{item.count}</span>
                                      <span className="history-word">{item.word || 'relax'}</span>
                                    </div>
                                    {item.lostFocusCount !== undefined && item.lostFocusCount > 0 && (
                                      <div className="history-lost-focus" title="Lost focus occurrences">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
                                        </svg>
                                        <span>{item.lostFocusCount}</span>
                                      </div>
                                    )}
                                  </div>
                                  <span className="history-date">
                                    {item.timestamp?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {todaySessions.length === 0 && !showAllHistory && (
                    <p className="no-history">No sessions today yet</p>
                  )}
                </>
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
