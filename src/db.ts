import Dexie, { Table } from 'dexie';

export interface Pair {
  id?: string;
  asset_tag: string;
  serial: string;
  scanned_at: string;
  status: 'pending' | 'uploaded' | 'error';
}

export interface UploadBatch {
  id?: string;
  items: Pair[];
  status: 'pending' | 'uploading' | 'done' | 'error';
  created_at: string;
  error_message?: string;
}

export interface AssetTag {
  tag: string;
  status: 'unused' | 'used';
  last_serial?: string;
  updated_at: string;
}

export interface AuthToken {
  id: string;
  token: string;
  username: string;
  expires_at: string;
}

class AppDB extends Dexie {
  pairs!: Table<Pair, string>;
  uploadQueue!: Table<UploadBatch, string>;
  assetTags!: Table<AssetTag, string>;
  authTokens!: Table<AuthToken, string>;

  constructor() {
    super('AssetTrackerDB');
    this.version(1).stores({
      pairs: '++id, asset_tag, serial, status',
      uploadQueue: '++id, status, created_at',
      assetTags: 'tag, status, updated_at',
      authTokens: 'id, expires_at'
    });
  }
}

export const db = new AppDB();

// Helper functions
export const dbHelpers = {
  // Database instance
  db,

  // Add a new pair
  async addPair(asset_tag: string, serial: string): Promise<string> {
    const pair: Pair = {
      asset_tag,
      serial,
      scanned_at: new Date().toISOString(),
      status: 'pending'
    };
    return await db.pairs.add(pair);
  },

  // Get all pending pairs
  async getPendingPairs(): Promise<Pair[]> {
    return await db.pairs.where('status').equals('pending').toArray();
  },

  // Queue pairs for upload
  async queueForUpload(pairs: Pair[]): Promise<string> {
    const batch: UploadBatch = {
      items: pairs,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    return await db.uploadQueue.add(batch);
  },

  // Get pending upload batches
  async getPendingUploads(): Promise<UploadBatch[]> {
    return await db.uploadQueue.where('status').equals('pending').toArray();
  },

  // Update asset tag status
  async updateAssetTag(tag: string, status: 'unused' | 'used', last_serial?: string): Promise<void> {
    await db.assetTags.put({
      tag,
      status,
      last_serial,
      updated_at: new Date().toISOString()
    });
  },

  // Get asset tag info
  async getAssetTag(tag: string): Promise<AssetTag | undefined> {
    return await db.assetTags.get(tag);
  },

  // Store auth token
  async storeAuthToken(token: string, username: string, expiresIn: number): Promise<void> {
    const expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
    await db.authTokens.clear(); // Only keep one token
    await db.authTokens.add({
      id: 'current',
      token,
      username,
      expires_at
    });
  },

  // Get current auth token
  async getCurrentAuthToken(): Promise<AuthToken | undefined> {
    const token = await db.authTokens.get('current');
    if (!token) return undefined;
    
    // Check if token is expired
    if (new Date(token.expires_at) <= new Date()) {
      await db.authTokens.delete('current');
      return undefined;
    }
    
    return token;
  },

  // Update pair status
  async updatePairStatus(asset_tag: string, serial: string, status: 'pending' | 'uploaded' | 'error'): Promise<void> {
    const pair = await db.pairs
      .where('asset_tag')
      .equals(asset_tag)
      .and(p => p.serial === serial)
      .first();
    if (pair && pair.id !== undefined) {
      await db.pairs.update(pair.id as string, { status });
    }
  },

  // Clear all data (logout)
  async clearAllData(): Promise<void> {
    await db.pairs.clear();
    await db.uploadQueue.clear();
    await db.authTokens.clear();
    // Keep asset tags for next login
  },

  // Clear only user data but keep asset tags
  async clearUserData(): Promise<void> {
    await db.pairs.clear();
    await db.uploadQueue.clear();
    await db.authTokens.clear();
  }
};
