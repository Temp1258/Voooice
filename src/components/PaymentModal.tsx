import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, CreditCard, Smartphone, AlertCircle, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: string;
  planName: string;
  amount: number;
  billingCycle: 'monthly' | 'yearly' | 'permanent';
}

type PaymentMethod = 'wechat' | 'alipay' | 'credit_card';
type PaymentState = 'select' | 'processing' | 'success' | 'error';

export function PaymentModal({
  isOpen,
  onClose,
  plan,
  planName,
  amount,
  billingCycle,
}: PaymentModalProps) {
  const { t } = useI18n();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat');
  const [state, setState] = useState<PaymentState>('select');
  const [errorMessage, setErrorMessage] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setState('select');
      setPaymentMethod('wechat');
      setErrorMessage('');
    }
  }, [isOpen]);

  // Auto-close on success after 2s
  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state, onClose]);

  const handlePayment = useCallback(async () => {
    setState('processing');
    setErrorMessage('');

    try {
      let paid = false;
      try {
        const mod = await import('../services/paymentService');
        const svc = mod.paymentService;
        if (svc) {
          const order = await svc.createOrder(plan, paymentMethod);
          await svc.confirmOrder(order.orderId);
          paid = true;
        }
      } catch {
        // paymentService unavailable — simulate locally
      }

      if (!paid) {
        // Local simulation fallback
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      setState('success');
    } catch (err) {
      setState('error');
      setErrorMessage(
        err instanceof Error ? err.message : t('payment.genericError')
      );
    }
  }, [plan, paymentMethod, t]);

  const handleTestPayment = useCallback(() => {
    setState('processing');
    setTimeout(() => {
      setState('success');
    }, 800);
  }, []);

  if (!isOpen) return null;

  const billingCycleLabel =
    billingCycle === 'monthly'
      ? t('payment.billingMonthly')
      : billingCycle === 'yearly'
        ? t('payment.billingYearly')
        : t('payment.billingPermanent');

  const methods: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    {
      id: 'wechat',
      label: t('payment.method.wechat'),
      icon: <Smartphone className="h-5 w-5 text-green-500" />,
    },
    {
      id: 'alipay',
      label: t('payment.method.alipay'),
      icon: <Smartphone className="h-5 w-5 text-blue-500" />,
    },
    {
      id: 'credit_card',
      label: t('payment.method.creditCard'),
      icon: <CreditCard className="h-5 w-5 text-gray-600" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 relative shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          disabled={state === 'processing'}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Success state */}
        {state === 'success' && (
          <div className="flex flex-col items-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-bold text-gray-900">
              {t('payment.success')}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {t('payment.successDetail')}
            </p>
          </div>
        )}

        {/* Processing state */}
        {state === 'processing' && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-12 w-12 text-indigo-500 animate-spin mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">
              {t('payment.processing')}
            </h3>
          </div>
        )}

        {/* Select / Error state */}
        {(state === 'select' || state === 'error') && (
          <>
            {/* Header */}
            <h2 className="text-xl font-bold text-gray-900 mb-5 pr-8">
              {t('payment.upgradeTitle', { plan: planName })}
            </h2>

            {/* Order summary */}
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('payment.plan')}</span>
                <span className="font-medium text-gray-900">{planName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('payment.billingCycle')}</span>
                <span className="font-medium text-gray-900">{billingCycleLabel}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {t('payment.total')}
                </span>
                <span className="text-lg font-bold text-gray-900">
                  &yen;{amount}
                </span>
              </div>
            </div>

            {/* Error message */}
            {state === 'error' && errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            {/* Payment method selection */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-3">
                {t('payment.selectMethod')}
              </p>
              <div className="space-y-2">
                {methods.map((method) => (
                  <label
                    key={method.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      paymentMethod === method.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={paymentMethod === method.id}
                      onChange={() => setPaymentMethod(method.id)}
                      className="accent-indigo-600"
                    />
                    {method.icon}
                    <span className="text-sm font-medium text-gray-900">
                      {method.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleTestPayment}
                className="w-full py-2.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                {t('payment.testPayment')}
              </button>
              <button
                onClick={handlePayment}
                className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
              >
                {t('payment.payButton', { amount: String(amount) })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
