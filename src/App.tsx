import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Home, Mic, Users, MessageSquare, ArrowLeft, Settings, Radio } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import { HomeView } from './components/HomeView';
import { PaymentModal } from './components/PaymentModal';
import { getAllVoicePrints } from './utils/storage';
import { voiceCloneService } from './services/voiceCloneService';
import { useI18n } from './i18n';
import type { AppView, VoicePrint } from './types';

// Lazy-loaded views for code splitting
const RecordView = lazy(() => import('./components/RecordView').then(m => ({ default: m.RecordView })));
const VoicePrintsView = lazy(() => import('./components/VoicePrintsView').then(m => ({ default: m.VoicePrintsView })));
const SpeakView = lazy(() => import('./components/SpeakView').then(m => ({ default: m.SpeakView })));
const MarketplaceView = lazy(() => import('./components/MarketplaceView').then(m => ({ default: m.MarketplaceView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const RealtimeView = lazy(() => import('./components/RealtimeView').then(m => ({ default: m.RealtimeView })));
const VoiceTrainingView = lazy(() => import('./components/VoiceTrainingView').then(m => ({ default: m.VoiceTrainingView })));
const AudiobookView = lazy(() => import('./components/AudiobookView').then(m => ({ default: m.AudiobookView })));
const MultiRoleDialogueView = lazy(() => import('./components/MultiRoleDialogueView').then(m => ({ default: m.MultiRoleDialogueView })));
const ApiDocsView = lazy(() => import('./components/ApiDocsView').then(m => ({ default: m.ApiDocsView })));
const PricingView = lazy(() => import('./components/PricingView').then(m => ({ default: m.PricingView })));
const VoiceBankView = lazy(() => import('./components/VoiceBankView').then(m => ({ default: m.VoiceBankView })));

function App() {
  const { t } = useI18n();
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [voicePrints, setVoicePrints] = useState<VoicePrint[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<{
    plan: string;
    planName: string;
    amount: number;
    billingCycle: 'monthly' | 'yearly' | 'permanent';
  } | null>(null);

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
    training: t('training.title'),
    audiobook: t('audiobook.title'),
    dialogue: t('dialogue.title'),
    apidocs: t('apidocs.title'),
    pricing: t('pricing.title'),
    voicebank: t('voicebank.title'),
  };

  const showBackButton = currentView !== 'home';

  const handleSelectPlan = (plan: string) => {
    const planInfo: Record<string, { name: string; amount: number; cycle: 'monthly' | 'yearly' | 'permanent' }> = {
      creator: { name: t('pricing.creator'), amount: 29, cycle: 'monthly' },
      voicebank: { name: t('pricing.voicebank'), amount: 99, cycle: 'yearly' },
      studio: { name: t('pricing.studio'), amount: 299, cycle: 'monthly' },
    };
    const info = planInfo[plan];
    if (info) {
      setPaymentModal({ plan, planName: info.name, amount: info.amount, billingCycle: info.cycle });
    }
  };

  const renderView = (): React.ReactNode => {
    switch (currentView) {
      case 'home':
        return <HomeView voicePrints={voicePrints} onNavigate={setCurrentView} />;
      case 'record':
        return <RecordView onSaved={handleVoicePrintSaved} />;
      case 'voiceprints':
        return <VoicePrintsView voicePrints={voicePrints} onDeleted={handleVoicePrintDeleted} />;
      case 'speak':
        return <SpeakView voicePrints={voicePrints} />;
      case 'realtime':
        return <RealtimeView voicePrints={voicePrints} />;
      case 'marketplace':
        return <MarketplaceView />;
      case 'settings':
        return <SettingsView />;
      case 'training':
        return <VoiceTrainingView onComplete={handleVoicePrintSaved} onCancel={() => setCurrentView('home')} />;
      case 'audiobook':
        return <AudiobookView voicePrints={voicePrints} />;
      case 'dialogue':
        return <MultiRoleDialogueView voicePrints={voicePrints} />;
      case 'apidocs':
        return <ApiDocsView />;
      case 'pricing':
        return <PricingView onSelectPlan={handleSelectPlan} />;
      case 'voicebank':
        return <VoiceBankView voicePrints={voicePrints} onVoicePrintSaved={handleVoicePrintSaved} />;
    }
  };

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
        <PrivacyConsentModal />

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
          <Suspense fallback={<div className="text-center text-gray-400 py-12">{t('common.loading')}</div>}>
            {renderView()}
          </Suspense>
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

      {/* Payment Modal */}
      {paymentModal && (
        <PaymentModal
          isOpen={true}
          onClose={() => setPaymentModal(null)}
          plan={paymentModal.plan}
          planName={paymentModal.planName}
          amount={paymentModal.amount}
          billingCycle={paymentModal.billingCycle}
        />
      )}
    </ErrorBoundary>
  );
}

export default App;
