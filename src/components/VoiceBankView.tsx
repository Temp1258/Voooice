import React, { useState } from 'react';
import { useI18n } from '../i18n';
import type { VoicePrint } from '../types';
import { GuidedRecordingTab } from './voicebank/GuidedRecordingTab';
import { VoiceVaultTab } from './voicebank/VoiceVaultTab';
import { VoiceLegacyTab } from './voicebank/VoiceLegacyTab';

interface VoiceBankViewProps {
  voicePrints: VoicePrint[];
  onVoicePrintSaved: (vp: VoicePrint) => void;
}

type TabId = 'guided' | 'vault' | 'legacy';

export function VoiceBankView({ voicePrints, onVoicePrintSaved }: VoiceBankViewProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>('guided');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'guided', label: t('voicebank.guidedRecording') },
    { id: 'vault', label: t('voicebank.voiceVault') },
    { id: 'legacy', label: t('voicebank.voiceLegacy') },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex rounded-xl bg-gray-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-rose-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'guided' && <GuidedRecordingTab onVoicePrintSaved={onVoicePrintSaved} />}
      {activeTab === 'vault' && <VoiceVaultTab voicePrints={voicePrints} />}
      {activeTab === 'legacy' && <VoiceLegacyTab voicePrints={voicePrints} />}
    </div>
  );
}
