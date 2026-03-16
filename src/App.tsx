import React, { useState, useEffect } from 'react';
import { Home, Mic, Users, MessageSquare, ArrowLeft, ShoppingBag, Settings } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import { HomeView } from './components/HomeView';
import { RecordView } from './components/RecordView';
import { VoicePrintsView } from './components/VoicePrintsView';
import { SpeakView } from './components/SpeakView';
import { MarketplaceView } from './components/MarketplaceView';
import { SettingsView } from './components/SettingsView';
import { getAllVoicePrints } from './utils/storage';
import { voiceCloneService } from './services/voiceCloneService';
import type { AppView, VoicePrint } from './types';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [voicePrints, setVoicePrints] = useState<VoicePrint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVoicePrints();
    // Restore API key if saved
    const savedKey = localStorage.getItem('vocaltext_api_key');
    if (savedKey) {
      voiceCloneService.setApiKey(savedKey);
    }
  }, []);

  const loadVoicePrints = async () => {
    try {
      const vps = await getAllVoicePrints();
      setVoicePrints(vps.sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      console.error('Failed to load voiceprints:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVoicePrintSaved = (vp: VoicePrint) => {
    setVoicePrints(prev => [vp, ...prev]);
    setCurrentView('voiceprints');
  };

  const handleVoicePrintDeleted = (id: string) => {
    setVoicePrints(prev => prev.filter(vp => vp.id !== id));
  };

  const viewTitle: Record<AppView, string> = {
    home: 'VocalText',
    record: '录制声音',
    voiceprints: '声纹档案',
    speak: '文字转语音',
    marketplace: '声纹市场',
    settings: '设置',
  };

  const showBackButton = currentView !== 'home';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Mic className="h-8 w-8 text-indigo-600" />
          </div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary onNavigateHome={() => setCurrentView('home')}>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Privacy consent */}
        <PrivacyConsentModal onAccept={() => {}} />

        {/* iOS-style navigation bar */}
        <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-0 z-50 pt-safe">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <div className="w-16">
              {showBackButton && (
                <button
                  onClick={() => setCurrentView('home')}
                  className="flex items-center space-x-1 text-indigo-600 active:text-indigo-800"
                  aria-label="返回首页"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="text-sm">返回</span>
                </button>
              )}
            </div>
            <h1 className="text-lg font-semibold text-gray-900">
              {viewTitle[currentView]}
            </h1>
            <div className="w-16 flex justify-end">
              {currentView === 'home' && (
                <button
                  onClick={() => setCurrentView('settings')}
                  className="p-1 text-gray-400 active:text-gray-600"
                  aria-label="设置"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6" role="main">
          {currentView === 'home' && (
            <HomeView voicePrints={voicePrints} onNavigate={setCurrentView} />
          )}
          {currentView === 'record' && (
            <RecordView onSaved={handleVoicePrintSaved} />
          )}
          {currentView === 'voiceprints' && (
            <VoicePrintsView
              voicePrints={voicePrints}
              onDeleted={handleVoicePrintDeleted}
            />
          )}
          {currentView === 'speak' && (
            <SpeakView voicePrints={voicePrints} />
          )}
          {currentView === 'marketplace' && (
            <MarketplaceView />
          )}
          {currentView === 'settings' && (
            <SettingsView />
          )}
        </main>

        {/* iOS-style tab bar */}
        <nav className="bg-white/80 backdrop-blur-lg border-t border-gray-200 sticky bottom-0 z-50 pb-safe" role="navigation" aria-label="主导航">
          <div className="max-w-lg mx-auto px-2 flex justify-around py-2">
            {[
              { view: 'home' as AppView, icon: Home, label: '首页' },
              { view: 'record' as AppView, icon: Mic, label: '录制' },
              { view: 'marketplace' as AppView, icon: ShoppingBag, label: '市场' },
              { view: 'voiceprints' as AppView, icon: Users, label: '声纹' },
              { view: 'speak' as AppView, icon: MessageSquare, label: '合成' },
            ].map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => setCurrentView(view)}
                className={`flex flex-col items-center space-y-0.5 px-2 py-1 rounded-lg transition-colors ${
                  currentView === view
                    ? 'text-indigo-600'
                    : 'text-gray-400 active:text-gray-600'
                }`}
                aria-label={label}
                aria-current={currentView === view ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </ErrorBoundary>
  );
}

export default App;
