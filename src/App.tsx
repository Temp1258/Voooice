import React, { useState, useEffect } from 'react';
import { Home, Mic, Users, MessageSquare, ArrowLeft, ShoppingBag, Settings, Radio } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import { HomeView } from './components/HomeView';
import { RecordView } from './components/RecordView';
import { VoicePrintsView } from './components/VoicePrintsView';
import { SpeakView } from './components/SpeakView';
import { MarketplaceView } from './components/MarketplaceView';
import { SettingsView } from './components/SettingsView';
import { RealtimeView } from './components/RealtimeView';
import { VoiceTrainingView } from './components/VoiceTrainingView';
import { AudiobookView } from './components/AudiobookView';
import { MultiRoleDialogueView } from './components/MultiRoleDialogueView';
import { ApiDocsView } from './components/ApiDocsView';
import { getAllVoicePrints } from './utils/storage';
import { voiceCloneService } from './services/voiceCloneService';
import { useI18n } from './i18n';
import type { AppView, VoicePrint } from './types';

function App() {
  const { t } = useI18n();
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
    record: t('record.title'),
    voiceprints: t('voiceprints.title'),
    speak: t('speak.title'),
    realtime: t('realtime.title'),
    marketplace: t('marketplace.title'),
    settings: t('settings.title'),
    training: '声纹训练',
    audiobook: '有声读物',
    dialogue: '多角色对话',
    apidocs: '开放 API',
  };

  const showBackButton = currentView !== 'home';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Mic className="h-8 w-8 text-indigo-600" />
          </div>
          <p className="text-gray-500">{t('common.loading')}</p>
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
                  aria-label={t('nav.back')}
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="text-sm">{t('nav.back')}</span>
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
                  aria-label={t('nav.settings')}
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
          {currentView === 'realtime' && (
            <RealtimeView voicePrints={voicePrints} />
          )}
          {currentView === 'marketplace' && (
            <MarketplaceView />
          )}
          {currentView === 'settings' && (
            <SettingsView />
          )}
          {currentView === 'training' && (
            <VoiceTrainingView
              onComplete={handleVoicePrintSaved}
              onCancel={() => setCurrentView('home')}
            />
          )}
          {currentView === 'audiobook' && (
            <AudiobookView voicePrints={voicePrints} />
          )}
          {currentView === 'dialogue' && (
            <MultiRoleDialogueView voicePrints={voicePrints} />
          )}
          {currentView === 'apidocs' && (
            <ApiDocsView />
          )}
        </main>

        {/* iOS-style tab bar */}
        <nav className="bg-white/80 backdrop-blur-lg border-t border-gray-200 sticky bottom-0 z-50 pb-safe" role="navigation" aria-label={t('nav.mainNav')}>
          <div className="max-w-lg mx-auto px-2 flex justify-around py-2">
            {[
              { view: 'home' as AppView, icon: Home, label: t('nav.home') },
              { view: 'record' as AppView, icon: Mic, label: t('nav.record') },
              { view: 'realtime' as AppView, icon: Radio, label: t('nav.realtime') },
              { view: 'voiceprints' as AppView, icon: Users, label: t('nav.voiceprints') },
              { view: 'speak' as AppView, icon: MessageSquare, label: t('nav.speak') },
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
