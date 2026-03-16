import React from 'react';
import { Mic, MessageSquare, Users, ChevronRight } from 'lucide-react';
import type { AppView, VoicePrint } from '../types';

interface HomeViewProps {
  voicePrints: VoicePrint[];
  onNavigate: (view: AppView) => void;
}

export function HomeView({ voicePrints, onNavigate }: HomeViewProps) {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mic className="h-10 w-10 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">欢迎使用 VocalText</h2>
        <p className="text-gray-500 max-w-sm mx-auto">
          录制您的声音，创建声纹档案，然后通过打字让 AI 模仿您的声音说话
        </p>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <button
          onClick={() => onNavigate('record')}
          className="w-full bg-indigo-600 text-white rounded-2xl p-5 flex items-center justify-between active:bg-indigo-700 transition-colors"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center">
              <Mic className="h-6 w-6 text-white" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-lg">录制声音</p>
              <p className="text-indigo-200 text-sm">创建新的声纹档案</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-indigo-300" />
        </button>

        <button
          onClick={() => onNavigate('speak')}
          className={`w-full rounded-2xl p-5 flex items-center justify-between transition-colors ${
            voicePrints.length > 0
              ? 'bg-white border-2 border-gray-200 active:bg-gray-50'
              : 'bg-gray-100 border-2 border-gray-100 opacity-60'
          }`}
          disabled={voicePrints.length === 0}
        >
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              voicePrints.length > 0 ? 'bg-green-100' : 'bg-gray-200'
            }`}>
              <MessageSquare className={`h-6 w-6 ${
                voicePrints.length > 0 ? 'text-green-600' : 'text-gray-400'
              }`} />
            </div>
            <div className="text-left">
              <p className={`font-semibold text-lg ${
                voicePrints.length > 0 ? 'text-gray-900' : 'text-gray-400'
              }`}>文字转语音</p>
              <p className="text-gray-400 text-sm">
                {voicePrints.length > 0
                  ? '用已有声纹合成语音'
                  : '请先录制声音'}
              </p>
            </div>
          </div>
          <ChevronRight className={`h-5 w-5 ${
            voicePrints.length > 0 ? 'text-gray-300' : 'text-gray-200'
          }`} />
        </button>

        <button
          onClick={() => onNavigate('voiceprints')}
          className="w-full bg-white border-2 border-gray-200 rounded-2xl p-5 flex items-center justify-between active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-lg text-gray-900">声纹档案</p>
              <p className="text-gray-400 text-sm">
                {voicePrints.length > 0
                  ? `已保存 ${voicePrints.length} 个声纹`
                  : '暂无声纹档案'}
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </button>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 rounded-2xl p-5 mt-4">
        <h3 className="font-semibold text-blue-900 mb-3">使用说明</h3>
        <div className="space-y-2 text-sm text-blue-700">
          <p>1. 点击「录制声音」朗读一段文字（建议 10-30 秒）</p>
          <p>2. 录制完成后保存为声纹档案</p>
          <p>3. 在「文字转语音」中选择声纹并输入文字</p>
          <p>4. 点击合成，即可听到模仿该声纹的语音</p>
        </div>
      </div>
    </div>
  );
}
