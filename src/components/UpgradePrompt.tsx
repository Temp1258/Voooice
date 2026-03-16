import React from 'react';
import { Lock } from 'lucide-react';
import { useI18n } from '../i18n';

interface UpgradePromptProps {
  feature: string;
  requiredPlan: string;
  onUpgrade: () => void;
  compact?: boolean;
}

export function UpgradePrompt({
  feature,
  requiredPlan,
  onUpgrade,
  compact = false,
}: UpgradePromptProps) {
  const { t } = useI18n();

  if (compact) {
    return (
      <button
        onClick={onUpgrade}
        className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full hover:bg-amber-200 active:bg-amber-300 transition-colors"
        title={t('upgrade.requiresPlan', { plan: requiredPlan })}
      >
        <span>&#128274;</span>
        <span>{requiredPlan}</span>
      </button>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-amber-900">
            {t('upgrade.featureLocked')}
          </h4>
          <p className="text-sm text-amber-700 mt-1">
            {t('upgrade.requiresPlan', { plan: requiredPlan })}
          </p>
        </div>
      </div>
      <button
        onClick={onUpgrade}
        className="mt-4 w-full py-2.5 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 active:bg-amber-700 transition-colors text-sm"
      >
        {t('upgrade.viewPlans')}
      </button>
    </div>
  );
}
