import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { PairBuilder } from './components/PairBuilder';
import { PairList } from './components/PairList';
import { SearchReplace } from './components/SearchReplace';
import { ToastManager } from './components/Toast';
import { dbHelpers } from './db';
import { api, networkManager } from './api';
import './index.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>>([]);

  useEffect(() => {
    checkAuthStatus();
    
    // Listen for network changes
    const handleOnlineStatus = (online: boolean) => {
      setIsOnline(online);
      if (online) {
        // Sync asset tags when back online
        networkManager.syncAssetTags();
      }
    };

    networkManager.addListener(handleOnlineStatus);
    
    // Listen for service worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'PROCESS_UPLOAD_QUEUE') {
          // Refresh the pair list when background sync completes
          setRefreshTrigger(prev => prev + 1);
        }
      });
    }

    return () => {
      networkManager.removeListener(handleOnlineStatus);
    };
  }, []);

  const addToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const checkAuthStatus = async () => {
    try {
      const token = await dbHelpers.getCurrentAuthToken();
      if (token) {
        setIsLoggedIn(true);
        setUsername(token.username);
        
        // Sync asset tags on app start if online
        if (navigator.onLine) {
          await networkManager.syncAssetTags();
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = (user: string) => {
    setIsLoggedIn(true);
    setUsername(user);
    
    // Sync asset tags after login
    if (navigator.onLine) {
      networkManager.syncAssetTags();
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setIsLoggedIn(false);
      setUsername('');
      setRefreshTrigger(0);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handlePairAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Asset Tracker</h1>
              <p className="text-sm text-gray-600">Welcome, {username}</p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Network Status */}
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              
              {/* Search & Replace Button */}
              <button
                onClick={() => setShowSearchReplace(true)}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
              >
                Search & Replace
              </button>
              
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Pair Builder */}
        <PairBuilder onPairAdded={handlePairAdded} addToast={addToast} />
        
        {/* Pair List */}
        <PairList refreshTrigger={refreshTrigger} />
        
        {/* Offline Notice */}
        {!isOnline && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-yellow-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p className="text-yellow-800 font-medium">You're offline</p>
                <p className="text-yellow-700 text-sm">Pairs will be stored locally and uploaded when connection is restored.</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Search & Replace Modal */}
      {showSearchReplace && (
        <SearchReplace onClose={() => setShowSearchReplace(false)} />
      )}

      {/* Footer */}
      <footer className="mt-12 py-6 text-center text-gray-500 text-sm">
        <p>Asset Tracker PWA • Offline-first • Scan • Store • Sync</p>
        <p className="mt-1">Made for iOS Safari • Add to Home Screen for best experience</p>
      </footer>

      {/* Toast Notifications */}
      <ToastManager toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

export default App;
