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

type VoiceProvider = 'elevenlabs' | 'azure' | 'browser';
type Locale = 'zh' | 'en';

interface SettingsViewProps {
  onNavigateHome?: () => void;
}

export function SettingsView({ onNavigateHome }: SettingsViewProps) {
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

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    // Simulate connection test
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setConnectionStatus(apiKey.length > 0 ? 'success' : 'error');
    setTestingConnection(false);
  };

  const handleClearCache = () => {
    if (confirm('确定要清除缓存吗？这不会删除您的声纹数据。')) {
      // Clear cache logic
      console.log('Cache cleared');
    }
  };

  const handleExportData = () => {
    console.log('Exporting data...');
  };

  const handleDeleteAllData = () => {
    if (
      confirm(
        '确定要删除所有数据吗？此操作不可恢复，您的所有声纹和设置将被永久删除。'
      )
    ) {
      if (confirm('再次确认：这将永久删除所有数据，是否继续？')) {
        console.log('All data deleted');
      }
    }
  };

  const providerOptions: { value: VoiceProvider; label: string }[] = [
    { value: 'elevenlabs', label: 'ElevenLabs' },
    { value: 'azure', label: 'Azure Speech' },
    { value: 'browser', label: '浏览器离线' },
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
      <h2 className="text-xl font-bold text-gray-900">设置</h2>

      {/* Account Section */}
      <div>
        <SectionHeader title="账户" />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <div className="px-4 py-4 flex items-center space-x-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">未登录</p>
              <p className="text-xs text-gray-400">登录以同步您的数据</p>
            </div>
            <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg active:bg-indigo-700 transition-colors">
              登录
            </button>
          </div>
          <SettingRow
            icon={<LogOut className="h-4 w-4 text-red-500" />}
            iconBg="bg-red-50"
            label="退出登录"
            onClick={() => console.log('Logout')}
          />
        </div>
      </div>

      {/* Voice Engine Section */}
      <div>
        <SectionHeader title="语音引擎" />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                <Volume2 className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-gray-900 text-sm font-medium">语音提供商</span>
            </div>
            <div className="flex space-x-2">
              {providerOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setProvider(opt.value)}
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

          {provider !== 'browser' && (
            <div className="px-4 py-3">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center">
                  <Key className="h-4 w-4 text-yellow-600" />
                </div>
                <span className="text-gray-900 text-sm font-medium">API 密钥</span>
              </div>
              <div className="flex space-x-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setConnectionStatus('idle');
                  }}
                  placeholder="输入 API 密钥…"
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
                    ? '测试中…'
                    : connectionStatus === 'success'
                      ? '已连接'
                      : connectionStatus === 'error'
                        ? '失败'
                        : '测试连接'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Storage Section */}
      <div>
        <SectionHeader title="存储" />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <HardDrive className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-900 text-sm font-medium">已用空间</span>
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
            label="清除缓存"
            onClick={handleClearCache}
          />
          <SettingRow
            icon={<Download className="h-4 w-4 text-green-600" />}
            iconBg="bg-green-50"
            label="导出所有数据"
            onClick={handleExportData}
          />
        </div>
      </div>

      {/* Notifications & Sync */}
      <div>
        <SectionHeader title="通知与同步" />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <SettingRow
            icon={<Info className="h-4 w-4 text-blue-600" />}
            iconBg="bg-blue-50"
            label="推送通知"
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
            label="自动同步"
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
        <SectionHeader title="语言" />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
                <Globe2 className="h-4 w-4 text-teal-600" />
              </div>
              <span className="text-gray-900 text-sm font-medium">界面语言</span>
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
        <SectionHeader title="隐私" />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <SettingRow
            icon={<Shield className="h-4 w-4 text-green-600" />}
            iconBg="bg-green-50"
            label="隐私政策"
            onClick={() => window.open('/privacy', '_blank')}
          />
          <SettingRow
            icon={<Trash2 className="h-4 w-4 text-red-500" />}
            iconBg="bg-red-50"
            label="删除所有数据"
            onClick={handleDeleteAllData}
          />
        </div>
      </div>

      {/* About Section */}
      <div>
        <SectionHeader title="关于" />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <SettingRow
            icon={<Info className="h-4 w-4 text-gray-500" />}
            iconBg="bg-gray-50"
            label="版本"
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
            label="开源许可"
            onClick={() => console.log('Show licenses')}
          />
        </div>
      </div>
    </div>
  );
}
