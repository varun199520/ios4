import { dbHelpers } from './db';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  expires_in: number;
}

export interface PairUploadRequest {
  asset_tag: string;
  serial: string;
  scanned_at: string;
}

export interface PairUploadResponse {
  status: 'ok_inserted' | 'ok_overwrite_same_pair' | 'missing_asset_tag' | 'asset_tag_in_use';
  asset_tag: string;
  serial: string;
  message?: string;
}

export interface AssetTagResponse {
  tag: string;
  status: 'unused' | 'used';
  last_serial?: string;
  updated_at: string;
}

export interface SearchResponse {
  asset_tag: string;
  serial?: string;
  status: 'unused' | 'used';
  history: Array<{
    serial: string;
    assigned_at: string;
    assigned_by: string;
  }>;
}

export interface ReplaceRequest {
  searchBy: 'asset_tag' | 'serial';
  value: string;
  new_asset_tag?: string;
  new_serial?: string;
}

class ApiClient {
  private async getAuthToken(): Promise<string | null> {
    const token = await dbHelpers.getCurrentAuthToken();
    return token?.token || null;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAuthToken();
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired, clear it
      await dbHelpers.clearUserData();
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Login failed: ${errorText}`);
    }

    const data = await response.json();
    
    // Store token in IndexedDB
    await dbHelpers.storeAuthToken(data.token, data.username, data.expires_in);
    
    return data;
  }

  async getAssetTags(since?: string): Promise<AssetTagResponse[]> {
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.makeRequest<AssetTagResponse[]>(`/asset-tags${params}`);
  }

  async uploadPairs(pairs: PairUploadRequest[]): Promise<PairUploadResponse[]> {
    return this.makeRequest<PairUploadResponse[]>('/pairs/batch', {
      method: 'POST',
      body: JSON.stringify(pairs),
    });
  }

  async searchPair(query: { asset_tag?: string; serial?: string }): Promise<SearchResponse> {
    const params = new URLSearchParams();
    if (query.asset_tag) params.set('asset_tag', query.asset_tag);
    if (query.serial) params.set('serial', query.serial);
    
    return this.makeRequest<SearchResponse>(`/pairs/search?${params}`);
  }

  async replacePair(request: ReplaceRequest): Promise<{ success: boolean; message: string }> {
    return this.makeRequest<{ success: boolean; message: string }>('/pairs/replace', {
      method: 'PUT',
      body: JSON.stringify(request),
    });
  }

  async logout(): Promise<void> {
    await dbHelpers.clearUserData();
  }
}

export const api = new ApiClient();

// Network status utilities
export class NetworkManager {
  private static instance: NetworkManager;
  private isOnline = navigator.onLine;
  private listeners: Array<(online: boolean) => void> = [];

  private constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners();
      this.processOfflineQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners();
    });
  }

  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  getStatus(): boolean {
    return this.isOnline;
  }

  addListener(callback: (online: boolean) => void): void {
    this.listeners.push(callback);
  }

  removeListener(callback: (online: boolean) => void): void {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.isOnline));
  }

  private async processOfflineQueue(): Promise<void> {
    if (!this.isOnline) return;

    try {
      const pendingBatches = await dbHelpers.getPendingUploads();
      
      for (const batch of pendingBatches) {
        try {
          const results = await api.uploadPairs(batch.items);
          
          // Update local asset tags based on results
          for (const result of results) {
            if (result.status === 'ok_inserted' || result.status === 'ok_overwrite_same_pair') {
              await dbHelpers.updateAssetTag(result.asset_tag, 'used', result.serial);
            }
          }

          // Mark batch as done
          await dbHelpers.db.uploadQueue.update(batch.id!, { status: 'done' });
          
          // Update pair statuses
          for (const pair of batch.items) {
            const result = results.find(r => r.asset_tag === pair.asset_tag && r.serial === pair.serial);
            if (result && (result.status === 'ok_inserted' || result.status === 'ok_overwrite_same_pair')) {
              await dbHelpers.db.pairs.where({ asset_tag: pair.asset_tag, serial: pair.serial })
                .modify({ status: 'uploaded' });
            }
          }
        } catch (error) {
          console.error('Failed to upload batch:', error);
          await dbHelpers.db.uploadQueue.update(batch.id!, { 
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Upload failed'
          });
        }
      }
    } catch (error) {
      console.error('Error processing offline queue:', error);
    }
  }

  async syncAssetTags(): Promise<void> {
    if (!this.isOnline) return;

    try {
      // Get last sync time
      const lastTag = await dbHelpers.db.assetTags.orderBy('updated_at').last();
      const since = lastTag?.updated_at;

      const assetTags = await api.getAssetTags(since);
      
      // Update local cache
      for (const tag of assetTags) {
        await dbHelpers.updateAssetTag(tag.tag, tag.status, tag.last_serial);
      }
    } catch (error) {
      console.error('Failed to sync asset tags:', error);
    }
  }
}

// Initialize network manager
export const networkManager = NetworkManager.getInstance();
