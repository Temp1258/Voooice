import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, Plus, Trash2, ChevronUp, ChevronDown, FileText, Upload,
  Play, Pause, Download, Lock, Check, AlertCircle, X, Mic,
  Users, Zap, Type, Clock, Hash, Wand2,
} from 'lucide-react';
import { voiceCloneService } from '../services/voiceCloneService';
import { downloadBlob } from '../utils/audioExport';
import { useI18n } from '../i18n';
import type {
  VoicePrint, EmotionType, AudioBook, Chapter, ChapterSegment, VoiceRole,
  AudioExportFormat,
} from '../types';

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'voooice_audiobooks';
const EMOTION_OPTIONS: EmotionType[] = ['neutral', 'happy', 'sad', 'angry', 'excited', 'calm'];
const ROLE_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];
const MAX_SEGMENT_LENGTH = 500;

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function splitTextIntoSegments(text: string, roles: VoiceRole[], narratorName: string): ChapterSegment[] {
  const segments: ChapterSegment[] = [];
  const dialoguePattern = /[\u300c\u201c]([^\u300d\u201d]*)[\u300d\u201d]/g;
  let lastIndex = 0;
  let order = 0;
  let match: RegExpExecArray | null;

  while ((match = dialoguePattern.exec(text)) !== null) {
    const beforeText = text.slice(lastIndex, match.index).trim();
    if (beforeText) {
      const narrationChunks = chunkText(beforeText);
      for (const chunk of narrationChunks) {
        segments.push({
          id: generateId(),
          text: chunk,
          roleName: narratorName,
          emotion: 'neutral',
          duration: 0,
          order: order++,
          status: 'pending',
        });
      }
    }
    const dialogueText = match[1].trim();
    if (dialogueText) {
      segments.push({
        id: generateId(),
        text: dialogueText,
        roleName: roles.length > 1 ? roles[1].name : narratorName,
        emotion: 'neutral',
        duration: 0,
        order: order++,
        status: 'pending',
      });
    }
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    const chunks = chunkText(remaining);
    for (const chunk of chunks) {
      segments.push({
        id: generateId(),
        text: chunk,
        roleName: narratorName,
        emotion: 'neutral',
        duration: 0,
        order: order++,
        status: 'pending',
      });
    }
  }

  if (segments.length === 0 && text.trim()) {
    const chunks = chunkText(text.trim());
    for (const chunk of chunks) {
      segments.push({
        id: generateId(),
        text: chunk,
        roleName: narratorName,
        emotion: 'neutral',
        duration: 0,
        order: order++,
        status: 'pending',
      });
    }
  }

  return segments;
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[。！？.!?\n])/);
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_SEGMENT_LENGTH && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks.length > 0 ? chunks : [text];
}

function splitByChapterMarkers(text: string): { title: string; content: string }[] {
  const pattern = /(?:^|\n)\s*((?:第[一二三四五六七八九十百千\d]+章|Chapter\s+\d+)[^\n]*)/gi;
  const matches: { index: number; title: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    matches.push({ index: match.index, title: match[1].trim() });
  }

  if (matches.length === 0) {
    return [{ title: 'Chapter 1', content: text.trim() }];
  }

  const chapters: { title: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].title.length + 1;
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    chapters.push({ title: matches[i].title, content });
  }

  return chapters;
}

function createDefaultNarrator(voicePrints: VoicePrint[]): VoiceRole {
  return {
    id: generateId(),
    name: 'Narrator',
    voicePrintId: voicePrints[0]?.id || '',
    defaultEmotion: 'neutral',
    speedMultiplier: 1.0,
    color: ROLE_COLORS[0],
  };
}

function createEmptyBook(voicePrints: VoicePrint[]): AudioBook {
  const narrator = createDefaultNarrator(voicePrints);
  return {
    id: generateId(),
    title: '',
    author: '',
    chapters: [],
    roles: [narrator],
    defaultNarratorId: narrator.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalDuration: 0,
    status: 'draft',
  };
}

function serializeBook(book: AudioBook): string {
  const cleanBook = {
    ...book,
    chapters: book.chapters.map(ch => ({
      ...ch,
      segments: ch.segments.map(seg => ({
        ...seg,
        audioBlob: undefined,
      })),
    })),
  };
  return JSON.stringify(cleanBook);
}

function loadBooksFromStorage(): AudioBook[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveBooksToStorage(books: AudioBook[]): void {
  try {
    const cleaned = books.map(b => JSON.parse(serializeBook(b)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type WorkbenchTab = 'project' | 'editor' | 'roles' | 'synthesize' | 'export';

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

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    synthesizing: 'bg-blue-100 text-blue-700 animate-pulse',
    done: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    draft: 'bg-gray-100 text-gray-600',
    completed: 'bg-green-100 text-green-700',
    published: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {t(`audiobook.status.${status}`)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Project
// ---------------------------------------------------------------------------

interface ProjectTabProps {
  book: AudioBook;
  setBook: (b: AudioBook) => void;
  selectedChapterId: string | null;
  setSelectedChapterId: (id: string | null) => void;
  setActiveTab: (tab: WorkbenchTab) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

function ProjectTab({ book, setBook, selectedChapterId, setSelectedChapterId, setActiveTab, t }: ProjectTabProps) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');

  const updateBook = (updates: Partial<AudioBook>) => {
    setBook({ ...book, ...updates, updatedAt: Date.now() });
  };

  const addChapter = () => {
    const newChapter: Chapter = {
      id: generateId(),
      title: `${t('audiobook.project.chapterTitle')} ${book.chapters.length + 1}`,
      order: book.chapters.length,
      rawText: '',
      segments: [],
      status: 'pending',
    };
    updateBook({ chapters: [...book.chapters, newChapter] });
  };

  const deleteChapter = (id: string) => {
    if (!confirm(t('audiobook.project.deleteChapterConfirm'))) return;
    const chapters = book.chapters.filter(c => c.id !== id).map((c, i) => ({ ...c, order: i }));
    updateBook({ chapters });
    if (selectedChapterId === id) setSelectedChapterId(null);
  };

  const moveChapter = (id: string, direction: 'up' | 'down') => {
    const idx = book.chapters.findIndex(c => c.id === id);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= book.chapters.length) return;
    const chapters = [...book.chapters];
    [chapters[idx], chapters[newIdx]] = [chapters[newIdx], chapters[idx]];
    updateBook({ chapters: chapters.map((c, i) => ({ ...c, order: i })) });
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    const parsed = splitByChapterMarkers(importText);
    const newChapters: Chapter[] = parsed.map((ch, i) => ({
      id: generateId(),
      title: ch.title,
      order: book.chapters.length + i,
      rawText: ch.content,
      segments: [],
      status: 'pending',
    }));
    updateBook({ chapters: [...book.chapters, ...newChapters] });
    setImportText('');
    setShowImportModal(false);
  };

  const selectChapter = (id: string) => {
    setSelectedChapterId(id);
    setActiveTab('editor');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">{t('audiobook.project.bookTitle')}</label>
          <input
            type="text"
            value={book.title}
            onChange={(e) => updateBook({ title: e.target.value })}
            placeholder={t('audiobook.project.bookTitlePlaceholder')}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">{t('audiobook.project.author')}</label>
          <input
            type="text"
            value={book.author}
            onChange={(e) => updateBook({ author: e.target.value })}
            placeholder={t('audiobook.project.authorPlaceholder')}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex space-x-2">
        <button
          onClick={() => setShowImportModal(true)}
          className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors"
        >
          <Upload className="h-4 w-4" />
          <span>{t('audiobook.project.importText')}</span>
        </button>
        <button
          onClick={addChapter}
          className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>{t('audiobook.project.addChapter')}</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('audiobook.project.chapters')}</h3>
        {book.chapters.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{t('audiobook.project.noChapters')}</p>
        ) : (
          <div className="space-y-2">
            {book.chapters.map((chapter, idx) => (
              <div
                key={chapter.id}
                className={`flex items-center space-x-2 p-3 rounded-xl border cursor-pointer transition-colors ${
                  selectedChapterId === chapter.id
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() => selectChapter(chapter.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400 font-mono">{idx + 1}</span>
                    <span className="text-sm font-medium text-gray-800 truncate">{chapter.title}</span>
                  </div>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-xs text-gray-400">
                      {t('audiobook.project.wordCount', { count: String(chapter.rawText.length) })}
                    </span>
                    <StatusBadge status={chapter.status} t={t} />
                  </div>
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => moveChapter(chapter.id, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moveChapter(chapter.id, 'down')}
                    disabled={idx === book.chapters.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteChapter(chapter.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{t('audiobook.project.importModal.title')}</h3>
              <button onClick={() => setShowImportModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={t('audiobook.project.importModal.placeholder')}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={12}
            />
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleImport}
                disabled={!importText.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
              >
                {t('audiobook.project.importModal.import')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Editor
// ---------------------------------------------------------------------------

interface EditorTabProps {
  book: AudioBook;
  setBook: (b: AudioBook) => void;
  selectedChapterId: string | null;
  t: (key: string, params?: Record<string, string>) => string;
}

function EditorTab({ book, setBook, selectedChapterId, t }: EditorTabProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chapter = book.chapters.find(c => c.id === selectedChapterId);

  if (!chapter) {
    return (
      <div className="text-center py-16">
        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">{t('audiobook.editor.selectChapter')}</p>
      </div>
    );
  }

  const updateChapter = (updates: Partial<Chapter>) => {
    const chapters = book.chapters.map(c =>
      c.id === chapter.id ? { ...c, ...updates } : c
    );
    setBook({ ...book, chapters, updatedAt: Date.now() });
  };

  const insertAtCursor = (before: string, after: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = chapter.rawText.slice(start, end);
    const newText = chapter.rawText.slice(0, start) + before + selected + after + chapter.rawText.slice(end);
    updateChapter({ rawText: newText });
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
    }, 0);
  };

  const handleAutoDetectRoles = () => {
    const narrator = book.roles.find(r => r.id === book.defaultNarratorId) || book.roles[0];
    const segments = splitTextIntoSegments(chapter.rawText, book.roles, narrator?.name || 'Narrator');
    updateChapter({ segments });
  };

  const wordCount = chapter.rawText.length;
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 250));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <input
          type="text"
          value={chapter.title}
          onChange={(e) => updateChapter({ title: e.target.value })}
          className="w-full text-lg font-semibold text-gray-900 border-none focus:outline-none focus:ring-0 bg-transparent"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3">
        <p className="text-xs font-medium text-gray-500 mb-2">{t('audiobook.editor.ssmlToolbar')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => insertAtCursor('<break time="500ms"/>')}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <Pause className="h-3 w-3" />
            <span>{t('audiobook.editor.insertPause')}</span>
          </button>
          <button
            onClick={() => insertAtCursor('<emphasis>', '</emphasis>')}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <Type className="h-3 w-3" />
            <span>{t('audiobook.editor.emphasis')}</span>
          </button>
          <button
            onClick={() => insertAtCursor('<prosody rate="fast">', '</prosody>')}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <Zap className="h-3 w-3" />
            <span>{t('audiobook.editor.speedChange')}</span>
          </button>
          <button
            onClick={() => insertAtCursor('[emotion:happy]', '[/emotion]')}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <Wand2 className="h-3 w-3" />
            <span>{t('audiobook.editor.emotionMark')}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <textarea
          ref={textareaRef}
          value={chapter.rawText}
          onChange={(e) => updateChapter({ rawText: e.target.value })}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
          rows={14}
          placeholder={t('audiobook.editor.chapterText')}
        />

        <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <Hash className="h-3 w-3" />
              <span>{t('audiobook.editor.wordCount')}: {wordCount}</span>
            </span>
            <span className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>{t('audiobook.editor.estimatedDuration')}: ~{estimatedMinutes} {t('audiobook.editor.minutes')}</span>
            </span>
          </div>
          <button
            onClick={handleAutoDetectRoles}
            disabled={!chapter.rawText.trim()}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            <Wand2 className="h-3 w-3" />
            <span>{t('audiobook.editor.autoDetectRoles')}</span>
          </button>
        </div>
      </div>

      {chapter.segments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            {t('audiobook.editor.segmentPreview')} ({chapter.segments.length} {t('audiobook.editor.segments')})
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {chapter.segments.map((seg) => {
              const role = book.roles.find(r => r.name === seg.roleName);
              return (
                <div key={seg.id} className="flex items-start space-x-2 text-xs p-2 bg-gray-50 rounded-lg">
                  <span
                    className="inline-block w-2 h-2 rounded-full mt-1 flex-shrink-0"
                    style={{ backgroundColor: role?.color || '#9ca3af' }}
                  />
                  <span className="font-medium text-gray-600 flex-shrink-0 w-16 truncate">{seg.roleName}</span>
                  <span className="text-gray-500 truncate">{seg.text.slice(0, 80)}{seg.text.length > 80 ? '...' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Roles
// ---------------------------------------------------------------------------

interface RolesTabProps {
  book: AudioBook;
  setBook: (b: AudioBook) => void;
  voicePrints: VoicePrint[];
  t: (key: string, params?: Record<string, string>) => string;
}

function RolesTab({ book, setBook, voicePrints, t }: RolesTabProps) {
  const updateRoles = (roles: VoiceRole[]) => {
    setBook({ ...book, roles, updatedAt: Date.now() });
  };

  const addRole = () => {
    const colorIdx = book.roles.length % ROLE_COLORS.length;
    const newRole: VoiceRole = {
      id: generateId(),
      name: `Role ${book.roles.length}`,
      voicePrintId: voicePrints[0]?.id || '',
      defaultEmotion: 'neutral',
      speedMultiplier: 1.0,
      color: ROLE_COLORS[colorIdx],
    };
    updateRoles([...book.roles, newRole]);
  };

  const updateRole = (id: string, updates: Partial<VoiceRole>) => {
    updateRoles(book.roles.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteRole = (id: string) => {
    if (id === book.defaultNarratorId) return;
    updateRoles(book.roles.filter(r => r.id !== id));
  };

  const emotionLabel = (emotion: EmotionType): string => {
    return t(`speak.emotion${emotion.charAt(0).toUpperCase() + emotion.slice(1)}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{t('audiobook.roles.title')}</h3>
        <button
          onClick={addRole}
          className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>{t('audiobook.roles.addRole')}</span>
        </button>
      </div>

      <div className="space-y-3">
        {book.roles.map((role) => {
          const isNarrator = role.id === book.defaultNarratorId;
          return (
            <div key={role.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: role.color }}
                  />
                  {isNarrator ? (
                    <span className="text-sm font-semibold text-gray-800">{t('audiobook.roles.narrator')}</span>
                  ) : (
                    <input
                      type="text"
                      value={role.name}
                      onChange={(e) => updateRole(role.id, { name: e.target.value })}
                      className="text-sm font-semibold text-gray-800 border-none focus:outline-none bg-transparent w-32"
                      placeholder={t('audiobook.roles.roleName')}
                    />
                  )}
                </div>
                {!isNarrator && (
                  <button
                    onClick={() => deleteRole(role.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title={t('audiobook.roles.deleteRole')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('audiobook.roles.voiceprint')}</label>
                <select
                  value={role.voicePrintId}
                  onChange={(e) => updateRole(role.id, { voicePrintId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {voicePrints.map(vp => (
                    <option key={vp.id} value={vp.id}>{vp.name} ({vp.averagePitch} Hz)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('audiobook.roles.emotion')}</label>
                <select
                  value={role.defaultEmotion}
                  onChange={(e) => updateRole(role.id, { defaultEmotion: e.target.value as EmotionType })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {EMOTION_OPTIONS.map(em => (
                    <option key={em} value={em}>{emotionLabel(em)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  {t('audiobook.roles.speed')}: {role.speedMultiplier.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={role.speedMultiplier}
                  onChange={(e) => updateRole(role.id, { speedMultiplier: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0.5x</span>
                  <span>2.0x</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('audiobook.roles.color')}</label>
                <div className="flex space-x-2">
                  {ROLE_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => updateRole(role.id, { color })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        role.color === color ? 'border-gray-800 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Synthesize
// ---------------------------------------------------------------------------

interface SynthesizeTabProps {
  book: AudioBook;
  setBook: (b: AudioBook) => void;
  voicePrints: VoicePrint[];
  t: (key: string, params?: Record<string, string>) => string;
}

function SynthesizeTab({ book, setBook, voicePrints, t }: SynthesizeTabProps) {
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pauseRef = useRef(false);
  const cancelRef = useRef(false);

  const allSegments = book.chapters.flatMap(ch => ch.segments);
  const totalSegments = allSegments.length;
  const doneSegments = allSegments.filter(s => s.status === 'done').length;
  const errorSegments = allSegments.filter(s => s.status === 'error').length;
  const overallProgress = totalSegments > 0 ? Math.round((doneSegments / totalSegments) * 100) : 0;

  const estimatedTimeMinutes = Math.max(1, Math.round((totalSegments - doneSegments) * 3 / 60));

  const handleStartSynthesis = useCallback(async () => {
    setIsSynthesizing(true);
    setIsPaused(false);
    pauseRef.current = false;
    cancelRef.current = false;

    const updatedBook = { ...book };

    for (let ci = 0; ci < updatedBook.chapters.length; ci++) {
      const chapter = updatedBook.chapters[ci];
      if (chapter.segments.length === 0) continue;

      updatedBook.chapters[ci] = { ...chapter, status: 'synthesizing' };
      setBook({ ...updatedBook, updatedAt: Date.now() });

      for (let si = 0; si < chapter.segments.length; si++) {
        if (cancelRef.current) break;

        while (pauseRef.current) {
          await new Promise(resolve => setTimeout(resolve, 200));
          if (cancelRef.current) break;
        }
        if (cancelRef.current) break;

        const segment = chapter.segments[si];
        if (segment.status === 'done') continue;

        const role = updatedBook.roles.find(r => r.name === segment.roleName) || updatedBook.roles[0];
        const vp = voicePrints.find(v => v.id === role?.voicePrintId);
        const voiceId = vp?.cloudVoiceId || vp?.id || voicePrints[0]?.id || '';

        updatedBook.chapters[ci].segments[si] = { ...segment, status: 'synthesizing' };
        setBook({ ...updatedBook, updatedAt: Date.now() });

        try {
          const audioBlob = await voiceCloneService.synthesize(segment.text, voiceId, {
            language: 'zh-CN',
            emotion: role?.defaultEmotion || 'neutral',
            speed: role?.speedMultiplier || 1.0,
            stability: 0.5,
            similarity: 0.75,
          });

          updatedBook.chapters[ci].segments[si] = {
            ...updatedBook.chapters[ci].segments[si],
            audioBlob,
            status: 'done',
            duration: segment.text.length * 0.12,
          };
        } catch (err) {
          console.error(`Synthesis failed for segment ${si}:`, err);
          updatedBook.chapters[ci].segments[si] = {
            ...updatedBook.chapters[ci].segments[si],
            status: 'error',
          };
        }

        setBook({ ...updatedBook, updatedAt: Date.now() });
      }

      if (cancelRef.current) break;

      const allDone = updatedBook.chapters[ci].segments.every(s => s.status === 'done');
      const hasError = updatedBook.chapters[ci].segments.some(s => s.status === 'error');
      updatedBook.chapters[ci] = {
        ...updatedBook.chapters[ci],
        status: allDone ? 'done' : hasError ? 'error' : 'pending',
      };
      setBook({ ...updatedBook, updatedAt: Date.now() });
    }

    const allChaptersDone = updatedBook.chapters.every(ch => ch.status === 'done' || ch.segments.length === 0);
    updatedBook.status = allChaptersDone ? 'completed' : 'draft';
    updatedBook.totalDuration = updatedBook.chapters.reduce(
      (sum, ch) => sum + ch.segments.reduce((s, seg) => s + seg.duration, 0), 0
    );
    setBook({ ...updatedBook, updatedAt: Date.now() });
    setIsSynthesizing(false);
  }, [book, setBook, voicePrints]);

  const handlePause = () => {
    pauseRef.current = true;
    setIsPaused(true);
  };

  const handleResume = () => {
    pauseRef.current = false;
    setIsPaused(false);
  };

  if (totalSegments === 0) {
    return (
      <div className="text-center py-16">
        <Zap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">{t('audiobook.synthesize.noSegments')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-indigo-600">{book.chapters.length}</p>
            <p className="text-xs text-gray-500">{t('audiobook.synthesize.totalChapters')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-600">{totalSegments}</p>
            <p className="text-xs text-gray-500">{t('audiobook.synthesize.totalSegments')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-600">~{estimatedTimeMinutes}m</p>
            <p className="text-xs text-gray-500">{t('audiobook.synthesize.estimatedTime')}</p>
          </div>
        </div>
      </div>

      <div className="flex space-x-3">
        {!isSynthesizing ? (
          <button
            onClick={handleStartSynthesis}
            className="flex-1 flex items-center justify-center space-x-2 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <Play className="h-4 w-4" />
            <span>{t('audiobook.synthesize.startSynthesis')}</span>
          </button>
        ) : isPaused ? (
          <button
            onClick={handleResume}
            className="flex-1 flex items-center justify-center space-x-2 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            <Play className="h-4 w-4" />
            <span>{t('audiobook.synthesize.resume')}</span>
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex-1 flex items-center justify-center space-x-2 py-3 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            <Pause className="h-4 w-4" />
            <span>{t('audiobook.synthesize.pause')}</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{t('audiobook.synthesize.overallProgress')}</span>
          <span className="text-sm font-bold text-indigo-600">{overallProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
          <span className="flex items-center space-x-1">
            <Check className="h-3 w-3 text-green-500" />
            <span>{doneSegments} {t('audiobook.synthesize.done')}</span>
          </span>
          {errorSegments > 0 && (
            <span className="flex items-center space-x-1">
              <AlertCircle className="h-3 w-3 text-red-500" />
              <span>{errorSegments} {t('audiobook.synthesize.error')}</span>
            </span>
          )}
          <span>{totalSegments - doneSegments - errorSegments} {t('audiobook.synthesize.pending')}</span>
        </div>
      </div>

      <div className="space-y-2">
        {book.chapters.map((chapter, idx) => {
          if (chapter.segments.length === 0) return null;
          const chDone = chapter.segments.filter(s => s.status === 'done').length;
          const chTotal = chapter.segments.length;
          const chProgress = Math.round((chDone / chTotal) * 100);
          return (
            <div key={chapter.id} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-700 truncate">
                  {t('audiobook.synthesize.chapterProgress', { index: String(idx + 1) })}: {chapter.title}
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">{chDone}/{chTotal}</span>
                  <StatusBadge status={chapter.status} t={t} />
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${chProgress}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 5: Export
// ---------------------------------------------------------------------------

interface ExportTabProps {
  book: AudioBook;
  selectedChapterId: string | null;
  t: (key: string, params?: Record<string, string>) => string;
}

function ExportTab({ book, selectedChapterId, t }: ExportTabProps) {
  const [format, setFormat] = useState<AudioExportFormat>('wav');
  const [includeMarkers, setIncludeMarkers] = useState(true);
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');

  const allSegments = book.chapters.flatMap(ch => ch.segments);
  const hasAudio = allSegments.some(s => s.status === 'done' && s.audioBlob);

  const handleExportChapter = () => {
    const chapter = book.chapters.find(c => c.id === selectedChapterId);
    if (!chapter) return;
    const blobs = chapter.segments
      .filter(s => s.status === 'done' && s.audioBlob)
      .map(s => s.audioBlob!);
    if (blobs.length === 0) return;
    const combined = new Blob(blobs, { type: 'audio/wav' });
    const safeName = (book.title || 'audiobook').replace(/[^\w\u4e00-\u9fff]/g, '_');
    downloadBlob(combined, `${safeName}_${chapter.title}.wav`);
  };

  const handleExportBook = () => {
    const blobs: Blob[] = [];
    for (const chapter of book.chapters) {
      for (const seg of chapter.segments) {
        if (seg.status === 'done' && seg.audioBlob) {
          blobs.push(seg.audioBlob);
        }
      }
    }
    if (blobs.length === 0) return;
    const combined = new Blob(blobs, { type: 'audio/wav' });
    const safeName = (book.title || 'audiobook').replace(/[^\w\u4e00-\u9fff]/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(combined, `${safeName}_${timestamp}.wav`);
  };

  if (!hasAudio) {
    return (
      <div className="text-center py-16">
        <Download className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">{t('audiobook.export.noAudio')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('audiobook.export.format')}</h4>
        <div className="space-y-2">
          <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
            format === 'wav' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
          }`}>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="format"
                value="wav"
                checked={format === 'wav'}
                onChange={() => setFormat('wav')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-800">{t('audiobook.export.wav')}</span>
            </div>
          </label>

          <label className={`flex items-center justify-between p-3 rounded-xl border cursor-not-allowed opacity-60 ${
            format === 'mp3' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50'
          }`}>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="format"
                value="mp3"
                disabled
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-800">{t('audiobook.export.mp3')}</span>
            </div>
            <span className="flex items-center space-x-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Lock className="h-3 w-3" />
              <span>{t('audiobook.export.proRequired')}</span>
            </span>
          </label>

          <label className={`flex items-center justify-between p-3 rounded-xl border cursor-not-allowed opacity-60 ${
            format === 'ogg' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50'
          }`}>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="format"
                value="ogg"
                disabled
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-800">{t('audiobook.export.ogg')}</span>
            </div>
            <span className="flex items-center space-x-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Lock className="h-3 w-3" />
              <span>{t('audiobook.export.proRequired')}</span>
            </span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">{t('audiobook.export.chapterMarkers')}</span>
          <button
            onClick={() => setIncludeMarkers(!includeMarkers)}
            className={`w-10 h-6 rounded-full transition-colors relative ${
              includeMarkers ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              includeMarkers ? 'left-[18px]' : 'left-0.5'
            }`} />
          </button>
        </div>

        <div>
          <label className="text-sm text-gray-700 block mb-2">{t('audiobook.export.quality')}</label>
          <div className="flex space-x-2">
            <button
              onClick={() => setQuality('standard')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                quality === 'standard'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('audiobook.export.standard')}
            </button>
            <button
              onClick={() => setQuality('high')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                quality === 'high'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('audiobook.export.high')}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {selectedChapterId && (
          <button
            onClick={handleExportChapter}
            className="w-full flex items-center justify-center space-x-2 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>{t('audiobook.export.exportChapter')}</span>
          </button>
        )}
        <button
          onClick={handleExportBook}
          className="w-full flex items-center justify-center space-x-2 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>{t('audiobook.export.exportBook')}</span>
        </button>
      </div>
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
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('project');
  const [book, setBook] = useState<AudioBook>(() => {
    const saved = loadBooksFromStorage();
    return saved.length > 0 ? saved[0] : createEmptyBook(voicePrints);
  });
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  useEffect(() => {
    saveBooksToStorage([book]);
  }, [book]);

  const handleNewBook = () => {
    if (book.chapters.length > 0 && !confirm(t('audiobook.project.newBook') + '?')) return;
    setBook(createEmptyBook(voicePrints));
    setSelectedChapterId(null);
    setActiveTab('project');
  };

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

      {activeTab === 'project' && (
        <ProjectTab
          book={book}
          setBook={setBook}
          selectedChapterId={selectedChapterId}
          setSelectedChapterId={setSelectedChapterId}
          setActiveTab={setActiveTab}
          t={t}
        />
      )}
      {activeTab === 'editor' && (
        <EditorTab
          book={book}
          setBook={setBook}
          selectedChapterId={selectedChapterId}
          t={t}
        />
      )}
      {activeTab === 'roles' && (
        <RolesTab
          book={book}
          setBook={setBook}
          voicePrints={voicePrints}
          t={t}
        />
      )}
      {activeTab === 'synthesize' && (
        <SynthesizeTab
          book={book}
          setBook={setBook}
          voicePrints={voicePrints}
          t={t}
        />
      )}
      {activeTab === 'export' && (
        <ExportTab
          book={book}
          selectedChapterId={selectedChapterId}
          t={t}
        />
      )}
    </div>
  );
}
