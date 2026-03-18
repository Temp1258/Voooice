// Shared plan definitions — single source of truth for all routes
const PLANS = {
  free: {
    name: 'Free',
    nameZh: '免费版',
    dailySynthesisLimit: 10,
    dailyCharacterLimit: 1000,
    maxVoiceprints: 3,
    cloudSynthesis: false,
    features: ['basic_recording', 'browser_tts', 'wav_export'],
    price: 0,
    priceYearly: 0,
  },
  creator: {
    name: 'Creator',
    nameZh: '创作者版',
    dailySynthesisLimit: 1000,
    dailyCharacterLimit: 100000,
    maxVoiceprints: -1,
    cloudSynthesis: true,
    features: ['basic_recording', 'cloud_tts', 'wav_export', 'mp3_export', 'audiobook_workbench', 'multi_role', 'voice_training'],
    price: 29.9,
    priceYearly: 299,
  },
  voicebank: {
    name: 'Voice Bank',
    nameZh: '声音银行版',
    dailySynthesisLimit: 100,
    dailyCharacterLimit: 10000,
    maxVoiceprints: 5,
    cloudSynthesis: true,
    features: ['basic_recording', 'cloud_tts', 'wav_export', 'guided_recording', 'voice_vault', 'voice_legacy', 'encrypted_backup'],
    price: 99,
    priceYearly: 99,
    pricePermanent: 199,
  },
  studio: {
    name: 'Studio',
    nameZh: '工作室版',
    dailySynthesisLimit: -1,
    dailyCharacterLimit: -1,
    maxVoiceprints: -1,
    cloudSynthesis: true,
    features: ['basic_recording', 'cloud_tts', 'wav_export', 'mp3_export', 'ogg_export', 'audiobook_workbench', 'multi_role', 'voice_training', 'api_access', 'batch_export', 'priority_queue'],
    price: 299,
    priceYearly: 2999,
  },
};

// Backward compatibility mappings
PLANS.pro = { ...PLANS.creator, name: 'Pro', nameZh: 'Pro' };
PLANS.enterprise = { ...PLANS.studio, name: 'Enterprise', nameZh: 'Enterprise', price: 99.9 };

// Helper to resolve plan key
function resolvePlan(plan) {
  if (plan === 'pro') return 'creator';
  if (plan === 'enterprise') return 'studio';
  return plan;
}

// Find the lowest-tier plan that includes a feature
function findRequiredPlan(feature) {
  const planOrder = ['free', 'creator', 'voicebank', 'studio'];
  for (const p of planOrder) {
    if (PLANS[p].features && PLANS[p].features.includes(feature)) {
      return p;
    }
  }
  return 'studio';
}

module.exports = { PLANS, resolvePlan, findRequiredPlan };
