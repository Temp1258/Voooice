/**
 * Global application state management using Zustand.
 * Replaces props drilling for voice prints, auth, settings, and navigation.
 */
import { create } from 'zustand';
import { getAllVoicePrints } from '../utils/storage';
import { voiceCloneService } from '../services/voiceCloneService';
import type { VoicePrint, AppView } from '../types';

interface AppState {
  // Voice prints
  voicePrints: VoicePrint[];
  loadingVoicePrints: boolean;
  loadVoicePrints: () => Promise<void>;
  addVoicePrint: (vp: VoicePrint) => void;
  removeVoicePrint: (id: string) => void;

  // Navigation (used as fallback when router isn't available)
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  // Provider state
  providerInitialized: boolean;
  initProvider: () => void;

  // Payment modal
  paymentModal: {
    plan: string;
    planName: string;
    amount: number;
    billingCycle: 'monthly' | 'yearly' | 'permanent';
  } | null;
  openPaymentModal: (data: AppState['paymentModal']) => void;
  closePaymentModal: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Voice prints
  voicePrints: [],
  loadingVoicePrints: true,

  loadVoicePrints: async () => {
    try {
      const vps = await getAllVoicePrints();
      set({ voicePrints: vps.sort((a, b) => b.createdAt - a.createdAt), loadingVoicePrints: false });
    } catch (err) {
      console.error('Failed to load voiceprints:', err);
      set({ loadingVoicePrints: false });
    }
  },

  addVoicePrint: (vp) => {
    set(state => ({ voicePrints: [vp, ...state.voicePrints] }));
  },

  removeVoicePrint: (id) => {
    set(state => ({ voicePrints: state.voicePrints.filter(vp => vp.id !== id) }));
  },

  // Navigation
  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),

  // Provider
  providerInitialized: false,
  initProvider: () => {
    if (get().providerInitialized) return;
    const savedProvider = localStorage.getItem('voooice_provider');
    if (savedProvider === 'local') {
      voiceCloneService.setLocalProvider();
    } else {
      const savedKey = sessionStorage.getItem('voooice_api_key') || localStorage.getItem('voooice_api_key');
      if (savedKey) {
        voiceCloneService.setApiKey(savedKey);
        if (localStorage.getItem('voooice_api_key')) {
          sessionStorage.setItem('voooice_api_key', savedKey);
          localStorage.removeItem('voooice_api_key');
        }
      } else {
        voiceCloneService.setLocalProvider();
      }
    }
    set({ providerInitialized: true });
  },

  // Payment modal
  paymentModal: null,
  openPaymentModal: (data) => set({ paymentModal: data }),
  closePaymentModal: () => set({ paymentModal: null }),
}));
