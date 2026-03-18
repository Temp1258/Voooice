import React from 'react';
import {
  BookOpen, Plus, FileText, Download,
  Users, Zap, Mic,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { AudiobookProvider, useAudiobook } from './audiobook/AudiobookContext';
import type { WorkbenchTab } from './audiobook/AudiobookContext';
import { ProjectTab } from './audiobook/ProjectTab';
import { EditorTab } from './audiobook/EditorTab';
import { RolesTab } from './audiobook/RolesTab';
import { SynthesizeTab } from './audiobook/SynthesizeTab';
import { ExportTab } from './audiobook/ExportTab';
import type { VoicePrint } from '../types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center space-x-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inner shell (consumes context)
// ---------------------------------------------------------------------------

function AudiobookWorkbench() {
  const { activeTab, setActiveTab, handleNewBook, t } = useAudiobook();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t('audiobook.workbench.title')}</h2>
          <p className="text-gray-500 text-xs mt-0.5">{t('audiobook.workbench.subtitle')}</p>
        </div>
        <button
          onClick={handleNewBook}
          className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>{t('audiobook.project.newBook')}</span>
        </button>
      </div>

      <div className="flex space-x-1 bg-gray-50 rounded-xl p-1 overflow-x-auto">
        <TabButton
          active={activeTab === 'project'}
          onClick={() => setActiveTab('project')}
          icon={<BookOpen className="h-4 w-4" />}
          label={t('audiobook.tab.project')}
        />
        <TabButton
          active={activeTab === 'editor'}
          onClick={() => setActiveTab('editor')}
          icon={<FileText className="h-4 w-4" />}
          label={t('audiobook.tab.editor')}
        />
        <TabButton
          active={activeTab === 'roles'}
          onClick={() => setActiveTab('roles')}
          icon={<Users className="h-4 w-4" />}
          label={t('audiobook.tab.roles')}
        />
        <TabButton
          active={activeTab === 'synthesize'}
          onClick={() => setActiveTab('synthesize')}
          icon={<Zap className="h-4 w-4" />}
          label={t('audiobook.tab.synthesize')}
        />
        <TabButton
          active={activeTab === 'export'}
          onClick={() => setActiveTab('export')}
          icon={<Download className="h-4 w-4" />}
          label={t('audiobook.tab.export')}
        />
      </div>

      {activeTab === 'project' && <ProjectTab />}
      {activeTab === 'editor' && <EditorTab />}
      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'synthesize' && <SynthesizeTab />}
      {activeTab === 'export' && <ExportTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface AudiobookViewProps {
  voicePrints: VoicePrint[];
}

export function AudiobookView({ voicePrints }: AudiobookViewProps) {
  const { t } = useI18n();

  if (voicePrints.length === 0) {
    return (
      <div className="text-center py-16">
        <Mic className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-500">{t('audiobook.workbench.noVoiceprints')}</h3>
        <p className="text-gray-400 text-sm mt-1">{t('audiobook.workbench.noVoiceprintsHint')}</p>
      </div>
    );
  }

  return (
    <AudiobookProvider voicePrints={voicePrints} t={t}>
      <AudiobookWorkbench />
    </AudiobookProvider>
  );
}
