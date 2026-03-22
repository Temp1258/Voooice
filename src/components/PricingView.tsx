import React, { useState } from 'react';
import { Check, Crown, Sparkles } from 'lucide-react';
import { useI18n } from '../i18n';

interface PricingViewProps {
  onSelectPlan: (plan: string) => void;
}

type BillingCycle = 'monthly' | 'yearly';

interface PlanConfig {
  id: string;
  nameKey: string;
  icon: React.ReactNode;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  permanentPrice: number | null;
  features: string[];
  buttonType: 'disabled' | 'indigo' | 'rose' | 'contact';
  buttonKey: string;
  popular?: boolean;
  hasPermanent?: boolean;
}

export function PricingView({ onSelectPlan }: PricingViewProps) {
  const { t } = useI18n();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const plans: PlanConfig[] = [
    {
      id: 'free',
      nameKey: 'pricing.free',
      icon: <Sparkles className="h-6 w-6 text-gray-400" />,
      monthlyPrice: 0,
      yearlyPrice: 0,
      permanentPrice: null,
      features: [
        'pricing.feature.voiceprints3',
        'pricing.feature.chars1000',
        'pricing.feature.browserTTS',
        'pricing.feature.wavExport',
        'pricing.feature.basicRecording',
      ],
      buttonType: 'disabled',
      buttonKey: 'pricing.currentPlan',
    },
    {
      id: 'creator',
      nameKey: 'pricing.creator',
      icon: <Crown className="h-6 w-6 text-indigo-500" />,
      monthlyPrice: 29,
      yearlyPrice: 299,
      permanentPrice: null,
      features: [
        'pricing.feature.voiceprintsUnlimited',
        'pricing.feature.chars100000',
        'pricing.feature.cloudTTS',
        'pricing.feature.wavMp3Export',
        'pricing.feature.audiobookWorkbench',
        'pricing.feature.multiRoleDialogue',
        'pricing.feature.voiceTraining',
      ],
      buttonType: 'indigo',
      buttonKey: 'pricing.upgrade',
      popular: true,
    },
    {
      id: 'voicebank',
      nameKey: 'pricing.voicebank',
      icon: <Sparkles className="h-6 w-6 text-rose-500" />,
      monthlyPrice: null,
      yearlyPrice: 99,
      permanentPrice: 199,
      features: [
        'pricing.feature.voiceprints5Family',
        'pricing.feature.chars10000',
        'pricing.feature.cloudTTS',
        'pricing.feature.guidedRecording',
        'pricing.feature.voiceVault',
        'pricing.feature.voiceLegacy',
        'pricing.feature.encryptedBackup',
      ],
      buttonType: 'rose',
      buttonKey: 'pricing.upgrade',
      hasPermanent: true,
    },
    {
      id: 'studio',
      nameKey: 'pricing.studio',
      icon: <Crown className="h-6 w-6 text-gray-600" />,
      monthlyPrice: 299,
      yearlyPrice: 2999,
      permanentPrice: null,
      features: [
        'pricing.feature.everythingInCreator',
        'pricing.feature.charsUnlimited',
        'pricing.feature.apiAccess',
        'pricing.feature.batchExport',
        'pricing.feature.priorityQueue',
        'pricing.feature.oggExport',
      ],
      buttonType: 'contact',
      buttonKey: 'pricing.contactUs',
    },
  ];

  const getPrice = (plan: PlanConfig): number => {
    if (plan.hasPermanent && billingCycle === 'yearly') {
      return plan.yearlyPrice ?? 0;
    }
    if (billingCycle === 'monthly' && plan.monthlyPrice !== null) {
      return plan.monthlyPrice;
    }
    return plan.yearlyPrice ?? plan.monthlyPrice ?? 0;
  };

  const getPriceSuffix = (plan: PlanConfig): string => {
    if (plan.id === 'free') return '';
    if (plan.hasPermanent && billingCycle === 'yearly') {
      return t('pricing.perYear');
    }
    if (billingCycle === 'monthly' && plan.monthlyPrice !== null) {
      return t('pricing.perMonth');
    }
    return t('pricing.perYear');
  };

  const getButtonClasses = (type: string): string => {
    switch (type) {
      case 'disabled':
        return 'bg-gray-100 text-gray-400 cursor-not-allowed';
      case 'indigo':
        return 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800';
      case 'rose':
        return 'bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700';
      case 'contact':
        return 'bg-gray-800 text-white hover:bg-gray-900 active:bg-gray-950';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('pricing.title')}</h2>
        <p className="text-gray-500 mt-1">{t('pricing.subtitle')}</p>
      </div>

      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="bg-gray-100 rounded-xl p-1 flex">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              billingCycle === 'monthly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {t('pricing.monthly')}
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              billingCycle === 'yearly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {t('pricing.yearly')}
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
              {t('pricing.saveBadge', { percent: '15' })}
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="space-y-4">
        {plans.map((plan) => {
          const price = getPrice(plan);
          const suffix = getPriceSuffix(plan);
          const isPopular = plan.popular;

          return (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl p-5 shadow-sm transition-all ${
                isPopular
                  ? 'border-2 border-indigo-500 shadow-indigo-100 shadow-md'
                  : 'border border-gray-200'
              }`}
            >
              {/* Most Popular badge */}
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {t('pricing.mostPopular')}
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isPopular
                        ? 'bg-indigo-100'
                        : plan.id === 'voicebank'
                          ? 'bg-rose-100'
                          : 'bg-gray-100'
                    }`}
                  >
                    {plan.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{t(plan.nameKey)}</h3>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-sm text-gray-400">&yen;</span>
                    <span className="text-2xl font-bold text-gray-900">{price}</span>
                  </div>
                  {suffix && <p className="text-xs text-gray-400">{suffix}</p>}
                  {plan.hasPermanent && (
                    <p className="text-[10px] text-rose-500 mt-0.5">
                      &yen;{plan.permanentPrice} {t('pricing.permanent')}
                    </p>
                  )}
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-4">
                {plan.features.map((featureKey) => (
                  <li key={featureKey} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>{t(featureKey)}</span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                onClick={() => {
                  if (plan.buttonType !== 'disabled') {
                    onSelectPlan(plan.id);
                  }
                }}
                disabled={plan.buttonType === 'disabled'}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${getButtonClasses(plan.buttonType)}`}
              >
                {t(plan.buttonKey)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
