import React, { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Upload, X } from 'lucide-react';
import { useAudiobook } from './AudiobookContext';
import {
  generateId, splitByChapterMarkers,
} from './audiobookUtils';
import type { AudioBook, Chapter } from '../../types';

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

export function ProjectTab() {
  const { book, setBook, selectedChapterId, setSelectedChapterId, setActiveTab, t } = useAudiobook();
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
