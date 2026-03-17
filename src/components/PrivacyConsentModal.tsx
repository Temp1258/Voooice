import React, { useState, useEffect } from 'react';
import { Shield, Lock, Eye, FileText } from 'lucide-react';
import { useI18n } from '../i18n';

const CONSENT_KEY = 'voooice_privacy_consent';
const CONSENT_TIMESTAMP_KEY = 'voooice_privacy_consent_ts';

interface PrivacyConsentModalProps {
  onAccept?: () => void;
  onDecline?: () => void;
}

export function PrivacyConsentModal({ onAccept, onDecline }: PrivacyConsentModalProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent !== 'accepted') {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    localStorage.setItem(CONSENT_TIMESTAMP_KEY, String(Date.now()));
    setVisible(false);
    onAccept?.();
  };

  const handleDecline = () => {
    setDeclined(true);
    onDecline?.();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Shield className="h-7 w-7 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {t('privacy.consentTitle')}
          </h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            {t('privacy.consentDescription')}
          </p>
        </div>

        {/* Content */}
        {!declined ? (
          <div className="px-6 pb-4 space-y-3">
            {/* Data points */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <InfoRow
                icon={<Eye className="h-5 w-5 text-blue-500" />}
                title={t('privacy.whatWeCollect')}
                detail={t('privacy.whatWeCollectDetail')}
              />
              <InfoRow
                icon={<Lock className="h-5 w-5 text-green-500" />}
                title={t('privacy.howStored')}
                detail={t('privacy.howStoredDetail')}
              />
              <InfoRow
                icon={<Shield className="h-5 w-5 text-purple-500" />}
                title={t('privacy.whoHasAccess')}
                detail={t('privacy.whoHasAccessDetail')}
              />
              <InfoRow
                icon={<FileText className="h-5 w-5 text-orange-500" />}
                title={t('privacy.yourRights')}
                detail={t('privacy.yourRightsDetail')}
              />
            </div>

            {/* Data usage explanation */}
            <p className="text-xs text-gray-400 leading-relaxed">
              {t('privacy.dataUsageExplanation')}
            </p>

            {/* Links */}
            <div className="flex justify-center gap-4 text-xs">
              <a
                href="/privacy"
                className="text-indigo-600 underline underline-offset-2"
              >
                {t('privacy.policyLink')}
              </a>
              <a
                href="/terms"
                className="text-indigo-600 underline underline-offset-2"
              >
                {t('privacy.termsLink')}
              </a>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800 leading-relaxed">
                {t('privacy.declineExplanation')}
              </p>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="px-6 pb-6 space-y-2">
          {!declined ? (
            <>
              <button
                onClick={handleAccept}
                className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-xl active:bg-indigo-700 transition-colors"
              >
                {t('privacy.accept')}
              </button>
              <button
                onClick={handleDecline}
                className="w-full py-3.5 bg-gray-100 text-gray-600 font-medium rounded-xl active:bg-gray-200 transition-colors"
              >
                {t('privacy.decline')}
              </button>
            </>
          ) : (
            <button
              onClick={() => setDeclined(false)}
              className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-xl active:bg-indigo-700 transition-colors"
            >
              {t('privacy.accept')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helper component
// ---------------------------------------------------------------------------

function InfoRow({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
      </div>
    </div>
  );
}
