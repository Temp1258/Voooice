import React, { useState, useEffect } from 'react';
import { Lock, Info } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { VoicePrint } from '../../types';
import { LEGACY_KEY } from './shared';

interface LegacySetting {
  voicePrintId: string;
  heirName: string;
  transferTrigger: 'manual' | 'auto';
  accessLevel: 'listen' | 'synthesize' | 'full';
}

export function VoiceLegacyTab({ voicePrints }: { voicePrints: VoicePrint[] }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<LegacySetting[]>([]);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LEGACY_KEY);
      if (saved) setSettings(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setSettings((prev) => {
      const existing = new Set(prev.map((s) => s.voicePrintId));
      const additions: LegacySetting[] = voicePrints
        .filter((vp) => !existing.has(vp.id))
        .map((vp) => ({ voicePrintId: vp.id, heirName: '', transferTrigger: 'manual' as const, accessLevel: 'listen' as const }));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
  }, [voicePrints]);

  const updateSetting = (vpId: string, updates: Partial<LegacySetting>) => {
    setSettings((prev) => prev.map((s) => (s.voicePrintId === vpId ? { ...s, ...updates } : s)));
  };

  const handleSave = () => {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(settings));
      setStatusMessage(t('voicebank.legacy.settingsSaved'));
      setTimeout(() => setStatusMessage(''), 2000);
    } catch { /* ignore */ }
  };

  if (voicePrints.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center border border-gray-200 space-y-3">
        <Lock className="h-12 w-12 text-gray-300 mx-auto" />
        <p className="text-sm text-gray-400">{t('voicebank.legacy.noVoices')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-rose-50 rounded-2xl p-4 flex gap-3">
        <Info className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-rose-700 leading-relaxed">{t('voicebank.legacy.description')}</p>
      </div>

      {voicePrints.map((vp) => {
        const setting = settings.find((s) => s.voicePrintId === vp.id) || {
          voicePrintId: vp.id, heirName: '', transferTrigger: 'manual' as const, accessLevel: 'listen' as const,
        };

        return (
          <div key={vp.id} className="bg-white rounded-2xl p-4 border border-gray-200 space-y-4">
            <h4 className="font-semibold text-gray-900">{vp.name}</h4>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('voicebank.legacy.heirName')}</label>
              <input
                type="text"
                value={setting.heirName}
                onChange={(e) => updateSetting(vp.id, { heirName: e.target.value })}
                placeholder={t('voicebank.legacy.heirPlaceholder')}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">{t('voicebank.legacy.transferTrigger')}</label>
              <div className="space-y-2">
                {(['manual', 'auto'] as const).map((trigger) => (
                  <label key={trigger} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={`trigger-${vp.id}`} checked={setting.transferTrigger === trigger} onChange={() => updateSetting(vp.id, { transferTrigger: trigger })} className="text-rose-500 focus:ring-rose-500" />
                    <span className="text-sm text-gray-700">{trigger === 'manual' ? t('voicebank.legacy.manualOnly') : t('voicebank.legacy.autoTransfer')}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">{t('voicebank.legacy.accessLevel')}</label>
              <div className="space-y-2">
                {(['listen', 'synthesize', 'full'] as const).map((level) => (
                  <label key={level} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={`access-${vp.id}`} checked={setting.accessLevel === level} onChange={() => updateSetting(vp.id, { accessLevel: level })} className="text-rose-500 focus:ring-rose-500" />
                    <span className="text-sm text-gray-700">
                      {level === 'listen' ? t('voicebank.legacy.listenOnly') : level === 'synthesize' ? t('voicebank.legacy.canSynthesize') : t('voicebank.legacy.fullControl')}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <button onClick={handleSave} className="w-full py-3 bg-rose-500 text-white rounded-xl font-medium active:bg-rose-600">
        {t('voicebank.legacy.saveSettings')}
      </button>

      {statusMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
