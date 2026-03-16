import React, { useState, useEffect } from 'react';
import { Home, Mic, Users, MessageSquare, ArrowLeft } from 'lucide-react';
import { HomeView } from './components/HomeView';
import { RecordView } from './components/RecordView';
import { VoicePrintsView } from './components/VoicePrintsView';
import { SpeakView } from './components/SpeakView';
import { getAllVoicePrints } from './utils/storage';
import type { AppView, VoicePrint } from './types';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [voicePrints, setVoicePrints] = useState<VoicePrint[]>([]);
  const [loading, setLoading] = useState(true);

  // Load voiceprints on mount
  useEffect(() => {
    loadVoicePrints();
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* iOS-style navigation bar */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="w-16">
            {showBackButton && (
              <button
                onClick={() => setCurrentView('home')}
                className="flex items-center space-x-1 text-indigo-600 active:text-indigo-800"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="text-sm">返回</span>
              </button>
            )}
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            {viewTitle[currentView]}
          </h1>
          <div className="w-16" />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
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
      </main>

      {/* iOS-style tab bar */}
      <nav className="bg-white/80 backdrop-blur-lg border-t border-gray-200 sticky bottom-0 z-50 pb-safe">
        <div className="max-w-lg mx-auto px-4 flex justify-around py-2">
          {[
            { view: 'home' as AppView, icon: Home, label: '首页' },
            { view: 'record' as AppView, icon: Mic, label: '录制' },
            { view: 'voiceprints' as AppView, icon: Users, label: '声纹' },
            { view: 'speak' as AppView, icon: MessageSquare, label: '合成' },
          ].map(({ view, icon: Icon, label }) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`flex flex-col items-center space-y-1 px-3 py-1 rounded-lg transition-colors ${
                currentView === view
                  ? 'text-indigo-600'
                  : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default App;
