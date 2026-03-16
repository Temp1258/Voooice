import React, { useState } from 'react';
import {
  User,
  Key,
  HardDrive,
  Globe2,
  Shield,
  Info,
  Trash2,
  Download,
  LogOut,
  ChevronRight,
  Volume2,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { voiceCloneService } from '../services/voiceCloneService';

type VoiceProvider = 'elevenlabs' | 'azure' | 'browser' | 'local';
type Locale = 'zh' | 'en';

interface SettingsViewProps {
  onNavigateHome?: () => void;
}

export function SettingsView({ onNavigateHome }: SettingsViewProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<VoiceProvider>('elevenlabs');
  const [apiKey, setApiKey] = useState('');
  const [locale, setLocale] = useState<Locale>('zh');
  const [notifications, setNotifications] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Mock storage data
  const usedStorage = 128; // MB
  const totalStorage = 500; // MB
  const storagePercent = (usedStorage / totalStorage) * 100;

  const [localUrl, setLocalUrl] = useState('http://localhost:8000');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleProviderChange = (newProvider: VoiceProvider) => {
    setProvider(newProvider);
    setConnectionStatus('idle');
    setConnectionError(null);
    if (newProvider === 'local') {
      voiceCloneService.setLocalProvider(localUrl);
    }
  };

  const handleTestConnection = async () => {
    if (provider === 'local') {
      // Test local TTS server health endpoint
      setTestingConnection(true);
      setConnectionStatus('idle');
      setConnectionError(null);
      try {
        const url = localUrl.replace(/\/+$/, '');
        const res = await fetch(`${url}/v1/health`, { method: 'GET' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setConnectionStatus('success');
        setConnectionError(
          `Server OK – models: ${(data.models ?? []).join(', ') || 'none'}, GPU: ${data.gpu ? 'yes' : 'no'}`,
        );
        // Update provider with current URL
        voiceCloneService.setLocalProvider(localUrl);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setConnectionStatus('error');
        setConnectionError(msg);
      } finally {
        setTestingConnection(false);
      }
      return;
    }

    if (!apiKey.trim()) {
      setConnectionStatus('error');
      setConnectionError(t('settings.enterApiKey'));
      return;
    }

    setTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionError(null);

    try {
      if (provider === 'elevenlabs') {
        // Real ElevenLabs API call to validate the key
        const res = await fetch('https://api.elevenlabs.io/v1/voices', {
          method: 'GET',
          headers: { 'xi-api-key': apiKey },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const detail = body?.detail?.message || body?.detail || `HTTP ${res.status}`;
          throw new Error(String(detail));
        }
        const data = await res.json();
        setConnectionStatus('success');
        setConnectionError(t('settings.connected', { count: String(data.voices?.length ?? 0) }));
      } else if (provider === 'azure') {
        // Azure Speech Services token endpoint test
        const res = await fetch(
          'https://eastus.api.cognitive.microsoft.com/sts/v1.0/issueToken',
          {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': apiKey,
              'Content-Length': '0',
            },
          },
        );
        if (!res.ok) {
          throw new Error(t('settings.azureAuthFailed', { status: String(res.status) }));
        }
        setConnectionStatus('success');
        setConnectionError(t('settings.azureConnected'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnectionStatus('error');
      setConnectionError(msg);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleClearCache = () => {
    if (confirm(t('settings.clearCacheConfirm'))) {
      // Clear cache logic
      console.log('Cache cleared');
    }
  };

  const handleExportData = () => {
    console.log('Exporting data...');
  };

  const handleDeleteAllData = () => {
    if (
      confirm(t('settings.deleteAllConfirm'))
    ) {
      if (confirm(t('settings.deleteAllConfirmAgain'))) {
        console.log('All data deleted');
      }
    }
  };

  const providerOptions: { value: VoiceProvider; label: string }[] = [
    { value: 'elevenlabs', label: 'ElevenLabs' },
    { value: 'azure', label: 'Azure Speech' },
    { value: 'browser', label: t('settings.browserOffline') },
    { value: 'local', label: t('settings.localTTS') },
  ];

  const ToggleSwitch = ({
    enabled,
    onToggle,
  }: {
    enabled: boolean;
    onToggle: () => void;
  }) => (
    <button
      onClick={onToggle}
      className={`relative w-12 h-7 rounded-full transition-colors ${
        enabled ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">
      {title}
    </h3>
  );

  const SettingRow = ({
    icon,
    iconBg,
    label,
    value,
    onClick,
    rightElement,
  }: {
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    value?: string;
    onClick?: () => void;
    rightElement?: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors"
      disabled={!onClick && !rightElement}
    >
      <div className="flex items-center space-x-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}
        >
          {icon}
        </div>
        <span className="text-gray-900 text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center space-x-2">
        {value && <span className="text-gray-400 text-sm">{value}</span>}
        {rightElement || (onClick && <ChevronRight className="h-4 w-4 text-gray-300" />)}
      </div>
    </button>
  );

  return (
    <div className="space-y-6 pb-8">
      <h2 className="text-xl font-bold text-gray-900">{t('settings.title')}</h2>

      {/* Account Section */}
      <div>
        <SectionHeader title={t('settings.account')} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <div className="px-4 py-4 flex items-center space-x-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{t('settings.notLoggedIn')}</p>
              <p className="text-xs text-gray-400">{t('settings.loginToSync')}</p>
            </div>
            <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg active:bg-indigo-700 transition-colors">
              {t('auth.login')}
            </button>
          </div>
          <SettingRow
            icon={<LogOut className="h-4 w-4 text-red-500" />}
            iconBg="bg-red-50"
            label={t('auth.logout')}
            onClick={() => console.log('Logout')}
          />
        </div>
      </div>

      {/* Voice Engine Section */}
      <div>
        <SectionHeader title={t('settings.voiceEngine')} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                <Volume2 className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-gray-900 text-sm font-medium">{t('settings.voiceProvider')}</span>
            </div>
            <div className="flex space-x-2">
              {providerOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleProviderChange(opt.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    provider === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {provider !== 'browser' && provider !== 'local' && (
            <div className="px-4 py-3">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center">
                  <Key className="h-4 w-4 text-yellow-600" />
                </div>
                <span className="text-gray-900 text-sm font-medium">{t('settings.apiKey')}</span>
              </div>
              <div className="flex space-x-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setConnectionStatus('idle');
                  }}
                  placeholder={t('settings.apiKeyPlaceholder')}
                  className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    connectionStatus === 'success'
                      ? 'bg-green-100 text-green-700'
                      : connectionStatus === 'error'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-indigo-100 text-indigo-700 active:bg-indigo-200'
                  }`}
                >
                  {testingConnection
                    ? t('settings.testing')
                    : connectionStatus === 'success'
                      ? t('settings.connectionSuccess')
                      : connectionStatus === 'error'
                        ? t('settings.connectionFailed')
                        : t('settings.testConnection')}
                </button>
              </div>
              {connectionError && connectionStatus !== 'idle' && (
                <p
                  className={`text-xs mt-2 ${
                    connectionStatus === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {connectionError}
                </p>
              )}
            </div>
          )}

          {provider === 'local' && (
            <div className="px-4 py-3">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                  <HardDrive className="h-4 w-4 text-orange-600" />
                </div>
                <span className="text-gray-900 text-sm font-medium">{t('settings.localTTS')}</span>
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={localUrl}
                  onChange={(e) => {
                    setLocalUrl(e.target.value);
                    setConnectionStatus('idle');
                  }}
                  placeholder="http://localhost:8000"
                  className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    connectionStatus === 'success'
                      ? 'bg-green-100 text-green-700'
                      : connectionStatus === 'error'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-indigo-100 text-indigo-700 active:bg-indigo-200'
                  }`}
                >
                  {testingConnection
                    ? t('settings.testing')
                    : connectionStatus === 'success'
                      ? t('settings.connectionSuccess')
                      : connectionStatus === 'error'
                        ? t('settings.connectionFailed')
                        : t('settings.testConnection')}
                </button>
              </div>
              {connectionError && connectionStatus !== 'idle' && (
                <p
                  className={`text-xs mt-2 ${
                    connectionStatus === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {connectionError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Storage Section */}
      <div>
        <SectionHeader title={t('settings.storage')} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <HardDrive className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-900 text-sm font-medium">{t('settings.usedStorage')}</span>
                  <span className="text-xs text-gray-400">
                    {usedStorage} MB / {totalStorage} MB
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
          <SettingRow
            icon={<Trash2 className="h-4 w-4 text-gray-500" />}
            iconBg="bg-gray-50"
            label={t('settings.clearCache')}
            onClick={handleClearCache}
          />
          <SettingRow
            icon={<Download className="h-4 w-4 text-green-600" />}
            iconBg="bg-green-50"
            label={t('settings.exportAllData')}
            onClick={handleExportData}
          />
        </div>
      </div>

      {/* Notifications & Sync */}
      <div>
        <SectionHeader title={t('settings.notificationsAndSync')} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <SettingRow
            icon={<Info className="h-4 w-4 text-blue-600" />}
            iconBg="bg-blue-50"
            label={t('settings.pushNotifications')}
            rightElement={
              <ToggleSwitch
                enabled={notifications}
                onToggle={() => setNotifications(!notifications)}
              />
            }
          />
          <SettingRow
            icon={<HardDrive className="h-4 w-4 text-indigo-600" />}
            iconBg="bg-indigo-50"
            label={t('settings.autoSync')}
            rightElement={
              <ToggleSwitch
                enabled={autoSync}
                onToggle={() => setAutoSync(!autoSync)}
              />
            }
          />
        </div>
      </div>

      {/* Language Section */}
      <div>
        <SectionHeader title={t('settings.language')} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
                <Globe2 className="h-4 w-4 text-teal-600" />
              </div>
              <span className="text-gray-900 text-sm font-medium">{t('settings.uiLanguage')}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setLocale('zh')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  locale === 'zh'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLocale('en')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  locale === 'en'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Section */}
      <div>
        <SectionHeader title={t('settings.privacy')} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <SettingRow
            icon={<Shield className="h-4 w-4 text-green-600" />}
            iconBg="bg-green-50"
            label={t('privacy.policyLink')}
            onClick={() => window.open('/privacy', '_blank')}
          />
          <SettingRow
            icon={<Trash2 className="h-4 w-4 text-red-500" />}
            iconBg="bg-red-50"
            label={t('settings.deleteAllData')}
            onClick={handleDeleteAllData}
          />
        </div>
      </div>

      {/* About Section */}
      <div>
        <SectionHeader title={t('settings.about')} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <SettingRow
            icon={<Info className="h-4 w-4 text-gray-500" />}
            iconBg="bg-gray-50"
            label={t('settings.version')}
            value="1.0.0"
          />
          <SettingRow
            icon={<Info className="h-4 w-4 text-gray-500" />}
            iconBg="bg-gray-50"
            label="GitHub"
            onClick={() =>
              window.open('https://github.com/vocaltext/vocaltext', '_blank')
            }
          />
          <SettingRow
            icon={<Info className="h-4 w-4 text-gray-500" />}
            iconBg="bg-gray-50"
            label={t('settings.openSourceLicenses')}
            onClick={() => console.log('Show licenses')}
          />
        </div>
      </div>
    </div>
  );
}
