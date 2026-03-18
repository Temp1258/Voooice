import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Home, Mic, Users, MessageSquare, ArrowLeft, Settings, Radio } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import { HomeView } from './components/HomeView';
import { PaymentModal } from './components/PaymentModal';
import { useAppStore } from './stores/appStore';
import { useI18n } from './i18n';
import type { AppView } from './types';

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
const VoiceCardView = lazy(() => import('./components/VoiceCardView').then(m => ({ default: m.VoiceCardView })));
const TimeCapsuleView = lazy(() => import('./components/TimeCapsuleView').then(m => ({ default: m.TimeCapsuleView })));

// Map route paths to view names for title
const pathToView: Record<string, AppView> = {
  '/': 'home',
  '/record': 'record',
  '/voiceprints': 'voiceprints',
  '/speak': 'speak',
  '/realtime': 'realtime',
  '/marketplace': 'marketplace',
  '/settings': 'settings',
  '/training': 'training',
  '/audiobook': 'audiobook',
  '/dialogue': 'dialogue',
  '/apidocs': 'apidocs',
  '/pricing': 'pricing',
  '/voicebank': 'voicebank',
  '/voicecard': 'voicecard',
  '/timecapsule': 'timecapsule',
};

function AppContent() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    voicePrints, loadingVoicePrints, loadVoicePrints,
    addVoicePrint, removeVoicePrint, initProvider,
    paymentModal, openPaymentModal, closePaymentModal,
  } = useAppStore();

  useEffect(() => {
    loadVoicePrints();
    initProvider();
  }, [loadVoicePrints, initProvider]);

  const currentView = pathToView[location.pathname] || 'home';

  const handleNavigate = (view: AppView) => {
    const path = view === 'home' ? '/' : `/${view}`;
    navigate(path);
  };

  const handleVoicePrintSaved = (vp: import('./types').VoicePrint) => {
    addVoicePrint(vp);
    navigate('/voiceprints');
  };

  const viewTitle: Record<AppView, string> = {
    home: 'Voooice',
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
    voicecard: t('voicecard.title'),
    timecapsule: t('timecapsule.title'),
  };

  const showBackButton = location.pathname !== '/';

  const handleSelectPlan = (plan: string) => {
    const planInfo: Record<string, { name: string; amount: number; cycle: 'monthly' | 'yearly' | 'permanent' }> = {
      creator: { name: t('pricing.creator'), amount: 29, cycle: 'monthly' },
      voicebank: { name: t('pricing.voicebank'), amount: 99, cycle: 'yearly' },
      studio: { name: t('pricing.studio'), amount: 299, cycle: 'monthly' },
    };
    const info = planInfo[plan];
    if (info) {
      openPaymentModal({ plan, planName: info.name, amount: info.amount, billingCycle: info.cycle });
    }
  };

  if (loadingVoicePrints) {
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
    <ErrorBoundary onNavigateHome={() => navigate('/')}>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <PrivacyConsentModal />

        {/* iOS-style navigation bar */}
        <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-0 z-50 pt-safe">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <div className="w-16">
              {showBackButton && (
                <button
                  onClick={() => navigate('/')}
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
                  onClick={() => navigate('/settings')}
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
            <Routes>
              <Route path="/" element={<HomeView voicePrints={voicePrints} onNavigate={handleNavigate} />} />
              <Route path="/record" element={<RecordView onSaved={handleVoicePrintSaved} />} />
              <Route path="/voiceprints" element={<VoicePrintsView voicePrints={voicePrints} onDeleted={removeVoicePrint} />} />
              <Route path="/speak" element={<SpeakView voicePrints={voicePrints} />} />
              <Route path="/realtime" element={<RealtimeView voicePrints={voicePrints} />} />
              <Route path="/marketplace" element={<MarketplaceView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/training" element={<VoiceTrainingView onComplete={handleVoicePrintSaved} onCancel={() => navigate('/')} />} />
              <Route path="/audiobook" element={<AudiobookView voicePrints={voicePrints} />} />
              <Route path="/dialogue" element={<MultiRoleDialogueView voicePrints={voicePrints} />} />
              <Route path="/apidocs" element={<ApiDocsView />} />
              <Route path="/pricing" element={<PricingView onSelectPlan={handleSelectPlan} />} />
              <Route path="/voicebank" element={<VoiceBankView voicePrints={voicePrints} onVoicePrintSaved={handleVoicePrintSaved} />} />
              <Route path="/voicecard" element={<VoiceCardView voicePrints={voicePrints} />} />
              <Route path="/timecapsule" element={<TimeCapsuleView voicePrints={voicePrints} />} />
            </Routes>
          </Suspense>
        </main>

        {/* iOS-style tab bar */}
        <nav className="bg-white/80 backdrop-blur-lg border-t border-gray-200 sticky bottom-0 z-50 pb-safe" role="navigation" aria-label={t('nav.mainNav')}>
          <div className="max-w-lg mx-auto px-2 flex justify-around py-2">
            {[
              { path: '/', view: 'home' as AppView, icon: Home, label: t('nav.home') },
              { path: '/record', view: 'record' as AppView, icon: Mic, label: t('nav.record') },
              { path: '/realtime', view: 'realtime' as AppView, icon: Radio, label: t('nav.realtime') },
              { path: '/voiceprints', view: 'voiceprints' as AppView, icon: Users, label: t('nav.voiceprints') },
              { path: '/speak', view: 'speak' as AppView, icon: MessageSquare, label: t('nav.speak') },
            ].map(({ path, view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => navigate(path)}
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

      {paymentModal && (
        <PaymentModal
          isOpen={true}
          onClose={closePaymentModal}
          plan={paymentModal.plan}
          planName={paymentModal.planName}
          amount={paymentModal.amount}
          billingCycle={paymentModal.billingCycle}
        />
      )}
    </ErrorBoundary>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
