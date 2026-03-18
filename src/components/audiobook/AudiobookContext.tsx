import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createEmptyBook, loadBooksFromStorage, saveBooksToStorage } from './audiobookUtils';
import type { AudioBook, VoicePrint } from '../../types';

export type WorkbenchTab = 'project' | 'editor' | 'roles' | 'synthesize' | 'export';

export interface AudiobookContextValue {
  book: AudioBook;
  setBook: (b: AudioBook) => void;
  selectedChapterId: string | null;
  setSelectedChapterId: (id: string | null) => void;
  activeTab: WorkbenchTab;
  setActiveTab: (tab: WorkbenchTab) => void;
  voicePrints: VoicePrint[];
  handleNewBook: () => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const AudiobookContext = createContext<AudiobookContextValue | null>(null);

export function useAudiobook(): AudiobookContextValue {
  const ctx = useContext(AudiobookContext);
  if (!ctx) {
    throw new Error('useAudiobook must be used within an AudiobookProvider');
  }
  return ctx;
}

interface AudiobookProviderProps {
  voicePrints: VoicePrint[];
  t: (key: string, params?: Record<string, string>) => string;
  children: React.ReactNode;
}

export function AudiobookProvider({ voicePrints, t, children }: AudiobookProviderProps) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('project');
  const [book, setBook] = useState<AudioBook>(() => {
    const saved = loadBooksFromStorage();
    return saved.length > 0 ? saved[0] : createEmptyBook(voicePrints);
  });
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  useEffect(() => {
    saveBooksToStorage([book]);
  }, [book]);

  const handleNewBook = useCallback(() => {
    if (book.chapters.length > 0 && !confirm(t('audiobook.project.newBook') + '?')) return;
    setBook(createEmptyBook(voicePrints));
    setSelectedChapterId(null);
    setActiveTab('project');
  }, [book.chapters.length, t, voicePrints]);

  const value: AudiobookContextValue = {
    book,
    setBook,
    selectedChapterId,
    setSelectedChapterId,
    activeTab,
    setActiveTab,
    voicePrints,
    handleNewBook,
    t,
  };

  return (
    <AudiobookContext.Provider value={value}>
      {children}
    </AudiobookContext.Provider>
  );
}
