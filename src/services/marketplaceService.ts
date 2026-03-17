/**
 * Marketplace service — API client for the voice marketplace.
 * Falls back to local mock data when the backend is unavailable.
 */
import type { MarketplaceVoice } from '../types';
import { API_BASE_URL } from '../config';

const API_BASE = API_BASE_URL;

class MarketplaceService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** List marketplace voices with optional search and filters */
  async listVoices(params?: {
    search?: string;
    language?: string;
    sort?: 'popular' | 'latest' | 'rating';
    priceFilter?: 'free' | 'paid' | 'all';
    page?: number;
    limit?: number;
  }): Promise<{ voices: MarketplaceVoice[]; total: number }> {
    try {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.language) query.set('language', params.language);
      if (params?.sort) query.set('sort', params.sort);
      if (params?.priceFilter) query.set('price', params.priceFilter);
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));

      const resp = await fetch(`${API_BASE}/api/marketplace/voices?${query}`, {
        headers: this.headers(),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch {
      // Fallback to empty - the component will use local mock data
      return { voices: [], total: 0 };
    }
  }

  /** Get a single marketplace voice by ID */
  async getVoice(id: string): Promise<MarketplaceVoice | null> {
    try {
      const resp = await fetch(`${API_BASE}/api/marketplace/voices/${id}`, {
        headers: this.headers(),
      });
      if (!resp.ok) return null;
      return resp.json();
    } catch {
      return null;
    }
  }

  /** Download/purchase a marketplace voice */
  async downloadVoice(id: string): Promise<{ success: boolean; voicePrintId?: string; error?: string }> {
    try {
      const resp = await fetch(`${API_BASE}/api/marketplace/voices/${id}/download`, {
        method: 'POST',
        headers: this.headers(),
      });
      return resp.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Upload a voice to the marketplace */
  async publishVoice(data: {
    name: string;
    description: string;
    price: number;
    currency: string;
    language: string;
    tags: string[];
    voicePrintId: string;
    previewAudio: Blob;
  }): Promise<{ success: boolean; voiceId?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('description', data.description);
      formData.append('price', String(data.price));
      formData.append('currency', data.currency);
      formData.append('language', data.language);
      formData.append('tags', JSON.stringify(data.tags));
      formData.append('voicePrintId', data.voicePrintId);
      formData.append('previewAudio', data.previewAudio);

      const headers: Record<string, string> = {};
      if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

      const resp = await fetch(`${API_BASE}/api/marketplace/voices`, {
        method: 'POST',
        headers,
        body: formData,
      });
      return resp.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Rate a marketplace voice */
  async rateVoice(id: string, rating: number): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE}/api/marketplace/voices/${id}/rate`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ rating }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}

export const marketplaceService = new MarketplaceService();
