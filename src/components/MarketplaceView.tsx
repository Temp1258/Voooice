import React, { useState, useEffect, useCallback } from 'react';
import { Search, Star, Download, Play, Tag, Filter, Globe2, Heart, Loader2, ShoppingCart, AlertCircle } from 'lucide-react';
import { useI18n } from '../i18n';
import type { MarketplaceVoice } from '../types';

const API_BASE = '/api';

type FilterTab = 'popular' | 'latest' | 'free';

interface MarketplaceState {
  voices: MarketplaceVoice[];
  total: number;
  loading: boolean;
  error: string | null;
  page: number;
}

async function fetchMarketplaceVoices(params: {
  search?: string;
  sort?: string;
  price?: string;
  page?: number;
  limit?: number;
}): Promise<{ voices: MarketplaceVoice[]; total: number }> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.sort) query.set('sort', params.sort);
  if (params.price) query.set('price', params.price);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const token = sessionStorage.getItem('voooice_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/marketplace/voices?${query}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch marketplace voices');
  return res.json();
}

async function downloadVoice(voiceId: string): Promise<{ success: boolean; error?: string }> {
  const token = sessionStorage.getItem('voooice_token');
  if (!token) return { success: false, error: 'Please log in to download voices' };

  const res = await fetch(`${API_BASE}/marketplace/voices/${voiceId}/download`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (res.status === 402) {
    const data = await res.json();
    return { success: false, error: data.error };
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Download failed' }));
    return { success: false, error: data.error };
  }

  return { success: true };
}

async function purchaseVoice(voiceId: string): Promise<{ success: boolean; error?: string }> {
  const token = sessionStorage.getItem('voooice_token');
  if (!token) return { success: false, error: 'Please log in to purchase voices' };

  const res = await fetch(`${API_BASE}/marketplace/voices/${voiceId}/purchase`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Purchase failed' }));
    return { success: false, error: data.error };
  }

  return { success: true };
}

async function rateVoice(voiceId: string, rating: number): Promise<boolean> {
  const token = sessionStorage.getItem('voooice_token');
  if (!token) return false;

  const res = await fetch(`${API_BASE}/marketplace/voices/${voiceId}/rate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });

  return res.ok;
}

export function MarketplaceView() {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('popular');
  const [selectedVoice, setSelectedVoice] = useState<MarketplaceVoice | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [state, setState] = useState<MarketplaceState>({
    voices: [],
    total: 0,
    loading: true,
    error: null,
    page: 1,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadVoices = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const sortMap: Record<FilterTab, string> = {
        popular: 'popular',
        latest: 'latest',
        free: 'popular',
      };
      const result = await fetchMarketplaceVoices({
        search: searchQuery || undefined,
        sort: sortMap[activeTab],
        price: activeTab === 'free' ? 'free' : undefined,
        page: state.page,
        limit: 20,
      });
      setState(prev => ({
        ...prev,
        voices: result.voices,
        total: result.total,
        loading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load voices',
      }));
    }
  }, [searchQuery, activeTab, state.page]);

  useEffect(() => {
    loadVoices();
  }, [loadVoices]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setState(prev => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleLike = (id: string) => {
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownload = async (voice: MarketplaceVoice) => {
    setActionLoading(true);
    setActionMessage(null);

    if (voice.price > 0) {
      // Try purchase first
      const purchaseResult = await purchaseVoice(voice.id);
      if (!purchaseResult.success && purchaseResult.error !== 'Voice already purchased') {
        setActionMessage({ type: 'error', text: purchaseResult.error || 'Purchase failed' });
        setActionLoading(false);
        return;
      }
    }

    const result = await downloadVoice(voice.id);
    if (result.success) {
      setActionMessage({ type: 'success', text: t('marketplace.downloadSuccess') });
      loadVoices(); // Refresh to update download count
    } else {
      setActionMessage({ type: 'error', text: result.error || 'Download failed' });
    }
    setActionLoading(false);
  };

  const handleRate = async (voiceId: string, rating: number) => {
    const success = await rateVoice(voiceId, rating);
    if (success) {
      loadVoices();
    }
  };

  const renderStars = (rating: number, interactive = false, voiceId?: string) => {
    const full = Math.floor(rating);
    const hasHalf = rating - full >= 0.5;
    const stars: React.ReactNode[] = [];
    for (let i = 0; i < 5; i++) {
      const starClass = i < full
        ? 'h-3.5 w-3.5 text-yellow-400 fill-yellow-400'
        : i === full && hasHalf
          ? 'h-3.5 w-3.5 text-yellow-400 fill-yellow-200'
          : 'h-3.5 w-3.5 text-gray-300';

      if (interactive && voiceId) {
        stars.push(
          <button key={i} onClick={() => handleRate(voiceId, i + 1)} className="focus:outline-none">
            <Star className={starClass} />
          </button>
        );
      } else {
        stars.push(<Star key={i} className={starClass} />);
      }
    }
    return stars;
  };

  const formatDownloads = (count: number) => {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}${t('marketplace.tenThousand')}`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'popular', label: t('marketplace.popular') },
    { key: 'latest', label: t('marketplace.latest') },
    { key: 'free', label: t('marketplace.free') },
  ];

  // Detail modal
  if (selectedVoice) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setSelectedVoice(null); setActionMessage(null); }}
          className="text-indigo-600 text-sm font-medium"
        >
          {t('marketplace.backToMarket')}
        </button>

        {actionMessage && (
          <div className={`p-3 rounded-xl text-sm flex items-center space-x-2 ${
            actionMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{actionMessage.text}</span>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium flex items-center space-x-1">
                <Globe2 className="h-3 w-3" />
                <span>{selectedVoice.language}</span>
              </span>
              <span className="text-2xl font-bold">
                {selectedVoice.price === 0 ? t('marketplace.free') : `¥${selectedVoice.price.toFixed(2)}`}
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-1">{selectedVoice.name}</h2>
            <p className="text-white/70 text-sm">{t('marketplace.author')}: {selectedVoice.authorName}</p>
          </div>

          <div className="p-4 border-b border-gray-100">
            <button className="w-full bg-indigo-50 text-indigo-600 rounded-xl py-3 flex items-center justify-center space-x-2 font-medium active:bg-indigo-100 transition-colors">
              <Play className="h-5 w-5" />
              <span>{t('marketplace.preview')}</span>
            </button>
          </div>

          <div className="p-4 border-b border-gray-100 flex items-center justify-around">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                {renderStars(selectedVoice.rating, true, selectedVoice.id)}
              </div>
              <p className="text-xs text-gray-400 mt-1">{selectedVoice.rating} {t('marketplace.rating')}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 text-gray-600">
                <Download className="h-4 w-4" />
                <span className="font-semibold">{formatDownloads(selectedVoice.downloads)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('marketplace.downloads')}</p>
            </div>
          </div>

          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">{t('marketplace.description')}</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{selectedVoice.description}</p>
          </div>

          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">{t('marketplace.tags')}</h3>
            <div className="flex flex-wrap gap-2">
              {selectedVoice.tags.map((tag) => (
                <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium flex items-center space-x-1">
                  <Tag className="h-3 w-3" />
                  <span>{tag}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="p-4">
            <button
              onClick={() => handleDownload(selectedVoice)}
              disabled={actionLoading}
              className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-semibold active:bg-indigo-700 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : selectedVoice.price > 0 ? (
                <>
                  <ShoppingCart className="h-5 w-5" />
                  <span>{t('marketplace.purchase', { price: selectedVoice.price.toFixed(2) })}</span>
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  <span>{t('marketplace.freeDownload')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('marketplace.search')}
          className="w-full pl-11 pr-10 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
        />
        <Filter className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
      </div>

      <div className="flex space-x-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 active:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {state.loading ? (
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 text-indigo-400 mx-auto animate-spin mb-3" />
          <p className="text-gray-400 text-sm">{t('common.loading')}</p>
        </div>
      ) : state.error ? (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 text-red-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{state.error}</p>
          <button
            onClick={loadVoices}
            className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : state.voices.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{t('marketplace.noResults')}</p>
          <p className="text-gray-400 text-sm mt-1">{t('marketplace.tryOtherKeywords')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {state.voices.map((voice) => (
              <div
                key={voice.id}
                onClick={() => setSelectedVoice(voice)}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
              >
                <div className="bg-gradient-to-br from-indigo-400 to-purple-500 p-3 relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLike(voice.id); }}
                    className="absolute top-2 right-2"
                  >
                    <Heart className={`h-4 w-4 ${likedIds.has(voice.id) ? 'text-red-400 fill-red-400' : 'text-white/60'}`} />
                  </button>
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mb-2">
                    <Play className="h-5 w-5 text-white" />
                  </div>
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] text-white font-medium flex items-center space-x-1 w-fit">
                    <Globe2 className="h-2.5 w-2.5" />
                    <span>{voice.language}</span>
                  </span>
                </div>

                <div className="p-3">
                  <h3 className="font-semibold text-gray-900 text-sm truncate">{voice.name}</h3>
                  <p className="text-xs text-gray-400 truncate">{voice.authorName}</p>
                  <div className="flex items-center space-x-1 mt-1.5">
                    {renderStars(voice.rating)}
                    <span className="text-[10px] text-gray-400 ml-1">{voice.rating}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="flex items-center space-x-0.5 text-[10px] text-gray-400">
                      <Download className="h-3 w-3" />
                      <span>{formatDownloads(voice.downloads)}</span>
                    </span>
                    <span className={`text-xs font-semibold ${voice.price === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                      {voice.price === 0 ? t('marketplace.free') : `¥${voice.price.toFixed(2)}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {state.total > 20 && (
            <div className="flex justify-center space-x-2 pt-4">
              <button
                onClick={() => setState(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={state.page <= 1}
                className="px-4 py-2 bg-gray-100 rounded-lg text-sm disabled:opacity-50"
              >
                {t('common.previous')}
              </button>
              <span className="px-4 py-2 text-sm text-gray-500">
                {state.page} / {Math.ceil(state.total / 20)}
              </span>
              <button
                onClick={() => setState(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={state.page >= Math.ceil(state.total / 20)}
                className="px-4 py-2 bg-gray-100 rounded-lg text-sm disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
