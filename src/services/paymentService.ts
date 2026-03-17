import { API_BASE_URL } from '../config';

const API_BASE = API_BASE_URL;

export interface Order {
  id: string;
  plan: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  createdAt: number;
  paidAt?: number;
  expiresAt?: number;
}

export interface PlanInfo {
  name: string;
  nameZh: string;
  price: number;
  priceYearly: number;
  pricePermanent?: number;
  features: string[];
  dailySynthesisLimit: number;
  dailyCharacterLimit: number;
  maxVoiceprints: number;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('voooice_auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export const paymentService = {
  async getPlans(): Promise<Record<string, PlanInfo>> {
    const response = await fetch(`${API_BASE}/api/subscription/plans`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse<{ plans: Record<string, PlanInfo> }>(response);
    return data.plans;
  },

  async createOrder(
    plan: string,
    paymentMethod: string
  ): Promise<{ orderId: string; clientSecret?: string; paymentUrl?: string }> {
    const response = await fetch(`${API_BASE}/api/payment/create-order`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ plan, paymentMethod }),
    });
    return handleResponse(response);
  },

  async confirmOrder(
    orderId: string
  ): Promise<{ success: boolean; plan: string; expiresAt: number }> {
    const response = await fetch(`${API_BASE}/api/payment/confirm`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ orderId }),
    });
    return handleResponse(response);
  },

  async getOrders(): Promise<Order[]> {
    const response = await fetch(`${API_BASE}/api/payment/orders`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse<{ orders: Order[] }>(response);
    return data.orders;
  },

  async cancelOrder(orderId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/payment/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ orderId }),
    });
    await handleResponse(response);
  },

  async checkFeature(
    feature: string
  ): Promise<{ allowed: boolean; currentPlan: string; requiredPlan: string }> {
    const response = await fetch(`${API_BASE}/api/subscription/check-feature`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ feature }),
    });
    return handleResponse(response);
  },

  async getSubscription(): Promise<{
    plan: string;
    usage: { synthesisCount: number; characterCount: number; synthesisLimit: number; characterLimit: number };
    subscription: { startedAt: number; expiresAt: number } | null;
  }> {
    const response = await fetch(`${API_BASE}/api/subscription`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },
};
