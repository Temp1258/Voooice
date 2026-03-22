import React from 'react';
import { Mic, MessageSquare, Users, ChevronRight, BookOpen, GraduationCap, MessageCircle, Heart, Send, Clock } from 'lucide-react';
import { useI18n } from '../i18n';
import type { AppView, VoicePrint } from '../types';

interface HomeViewProps {
  voicePrints: VoicePrint[];
  onNavigate: (view: AppView) => void;
}

export function HomeView({ voicePrints, onNavigate }: HomeViewProps) {
  const { t } = useI18n();
  const hasVoices = voicePrints.length > 0;

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mic className="h-10 w-10 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('home.welcomeTitle')}</h2>
        <p className="text-gray-500 max-w-sm mx-auto">
          {t('home.welcomeDescription')}
        </p>
      </div>

      {/* === Core Actions (Primary User Journey) === */}
      <div className="space-y-3">
        {/* 1. Record */}
        <button
          onClick={() => onNavigate('record')}
          className="w-full bg-indigo-600 text-white rounded-2xl p-5 flex items-center justify-between active:bg-indigo-700 transition-colors"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center">
              <Mic className="h-6 w-6 text-white" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-lg">{t('home.recordButton')}</p>
              <p className="text-indigo-200 text-sm">{t('home.recordSubDescription')}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-indigo-300" />
        </button>

        {/* 2. Synthesize */}
        <button
          onClick={() => onNavigate('speak')}
          className={`w-full rounded-2xl p-5 flex items-center justify-between transition-colors ${
            hasVoices
              ? 'bg-white border-2 border-gray-200 active:bg-gray-50'
              : 'bg-gray-100 border-2 border-gray-100 opacity-60'
          }`}
          disabled={!hasVoices}
        >
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${hasVoices ? 'bg-green-100' : 'bg-gray-200'}`}>
              <MessageSquare className={`h-6 w-6 ${hasVoices ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div className="text-left">
              <p className={`font-semibold text-lg ${hasVoices ? 'text-gray-900' : 'text-gray-400'}`}>{t('home.speakButton')}</p>
              <p className="text-gray-400 text-sm">
                {hasVoices ? t('home.speakSubDescription') : t('home.speakNeedRecord')}
              </p>
            </div>
          </div>
          <ChevronRight className={`h-5 w-5 ${hasVoices ? 'text-gray-300' : 'text-gray-200'}`} />
        </button>

        {/* 3. Voice Library */}
        <button
          onClick={() => onNavigate('voiceprints')}
          className="w-full bg-white border-2 border-gray-200 rounded-2xl p-5 flex items-center justify-between active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-lg text-gray-900">{t('home.voiceprintsButton')}</p>
              <p className="text-gray-400 text-sm">
                {hasVoices
                  ? t('home.voiceprintsSaved', { count: String(voicePrints.length) })
                  : t('home.voiceprintsEmpty')}
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </button>
      </div>

      {/* === Creative Tools (Secondary - requires voices) === */}
      {hasVoices && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">{t('home.creativeTools')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onNavigate('audiobook')}
              className="bg-white border border-gray-200 rounded-xl p-3 text-left active:bg-gray-50"
            >
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <p className="font-medium text-sm text-gray-900">{t('audiobook.title')}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t('audiobook.description')}</p>
            </button>

            <button
              onClick={() => onNavigate('dialogue')}
              className="bg-white border border-gray-200 rounded-xl p-3 text-left active:bg-gray-50"
            >
              <div className="w-9 h-9 bg-pink-100 rounded-lg flex items-center justify-center mb-2">
                <MessageCircle className="h-5 w-5 text-pink-600" />
              </div>
              <p className="font-medium text-sm text-gray-900">{t('dialogue.title')}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t('dialogue.description')}</p>
            </button>

            <button
              onClick={() => onNavigate('voicecard')}
              className="bg-white border border-gray-200 rounded-xl p-3 text-left active:bg-gray-50"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-pink-100 to-rose-100 rounded-lg flex items-center justify-center mb-2">
                <Send className="h-5 w-5 text-pink-600" />
              </div>
              <p className="font-medium text-sm text-gray-900">{t('voicecard.title')}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t('voicecard.homeDesc')}</p>
            </button>

            <button
              onClick={() => onNavigate('timecapsule')}
              className="bg-white border border-gray-200 rounded-xl p-3 text-left active:bg-gray-50"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-indigo-600" />
              </div>
              <p className="font-medium text-sm text-gray-900">{t('timecapsule.title')}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t('timecapsule.homeDesc')}</p>
            </button>
          </div>
        </div>
      )}

      {/* === Advanced Features === */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">{t('home.advancedFeatures')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onNavigate('training')}
            className="bg-white border border-gray-200 rounded-xl p-3 text-left active:bg-gray-50"
          >
            <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center mb-2">
              <GraduationCap className="h-5 w-5 text-teal-600" />
            </div>
            <p className="font-medium text-sm text-gray-900">{t('training.title')}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{t('training.description')}</p>
          </button>

          <button
            onClick={() => onNavigate('voicebank')}
            className="bg-white border border-gray-200 rounded-xl p-3 text-left active:bg-gray-50"
          >
            <div className="w-9 h-9 bg-rose-100 rounded-lg flex items-center justify-center mb-2">
              <Heart className="h-5 w-5 text-rose-600" />
            </div>
            <p className="font-medium text-sm text-gray-900">{t('voicebank.title')}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{t('voicebank.homeDescription')}</p>
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 rounded-2xl p-5 mt-4">
        <h3 className="font-semibold text-blue-900 mb-3">{t('home.howItWorksTitle')}</h3>
        <div className="space-y-2 text-sm text-blue-700">
          <p>{t('home.instruction1')}</p>
          <p>{t('home.instruction2')}</p>
          <p>{t('home.instruction3')}</p>
          <p>{t('home.instruction4')}</p>
        </div>
      </div>
    </div>
  );
}
