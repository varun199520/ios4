import React, { useState, useEffect } from 'react';
import { Pair, dbHelpers } from '../db';
import { api, networkManager } from '../api';

interface PairListProps {
  refreshTrigger: number;
}

export const PairList: React.FC<PairListProps> = ({ refreshTrigger }) => {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  useEffect(() => {
    loadPairs();
  }, [refreshTrigger]);

  useEffect(() => {
    const handleOnlineStatus = (online: boolean) => {
      setIsOnline(online);
      if (online) {
        setUploadStatus('Back online - ready to upload');
        setTimeout(() => setUploadStatus(''), 3000);
      } else {
        setUploadStatus('Offline - pairs will be queued');
      }
    };

    networkManager.addListener(handleOnlineStatus);
    return () => networkManager.removeListener(handleOnlineStatus);
  }, []);

  const loadPairs = async () => {
    try {
      const pendingPairs = await dbHelpers.getPendingPairs();
      setPairs(pendingPairs);
    } catch (error) {
      console.error('Failed to load pairs:', error);
    }
  };

  const deletePair = async (pairId: string) => {
    try {
      await dbHelpers.db.pairs.delete(pairId);
      await loadPairs();
    } catch (error) {
      console.error('Failed to delete pair:', error);
    }
  };

  const uploadPairs = async () => {
    if (pairs.length === 0) return;

    setIsUploading(true);
    setUploadStatus('');

    try {
      if (isOnline) {
        // Direct upload
        const uploadData = pairs.map(pair => ({
          asset_tag: pair.asset_tag,
          serial: pair.serial,
          scanned_at: pair.scanned_at
        }));

        const results = await api.uploadPairs(uploadData);
        
        // Process results
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const pair = pairs[i];

          if (result.status === 'ok_inserted' || result.status === 'ok_overwrite_same_pair') {
            successCount++;
            // Update local asset tag status
            await dbHelpers.updateAssetTag(result.asset_tag, 'used', result.serial);
            // Mark pair as uploaded
            await dbHelpers.db.pairs.update(pair.id!, { status: 'uploaded' });
          } else {
            errorCount++;
            if (result.status === 'missing_asset_tag') {
              errors.push(`${result.asset_tag}: Asset tag not found in system`);
            } else if (result.status === 'asset_tag_in_use') {
              errors.push(`${result.asset_tag}: Already used with different serial`);
            }
            // Mark pair as error
            await dbHelpers.db.pairs.update(pair.id!, { status: 'error' });
          }
        }

        if (successCount > 0) {
          setUploadStatus(`✓ ${successCount} pairs uploaded successfully`);
        }
        if (errorCount > 0) {
          setUploadStatus(prev => prev + ` | ${errorCount} errors: ${errors.join(', ')}`);
        }

      } else {
        // Queue for offline upload
        await dbHelpers.queueForUpload(pairs);
        setUploadStatus('Pairs queued for upload when online');
        
        // Mark pairs as pending upload
        for (const pair of pairs) {
          await dbHelpers.db.pairs.update(pair.id!, { status: 'pending' });
        }
      }

      // Refresh the list
      await loadPairs();

    } catch (error) {
      console.error('Upload failed:', error);
      setUploadStatus(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      // Clear status after 5 seconds
      setTimeout(() => setUploadStatus(''), 5000);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded': return 'text-green-600 bg-green-50';
      case 'error': return 'text-red-600 bg-red-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'uploaded': return 'Uploaded';
      case 'error': return 'Error';
      default: return 'Pending';
    }
  };

  if (pairs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Scanned Pairs</h2>
        <div className="text-center py-8 text-gray-500">
          <p>No pairs scanned yet</p>
          <p className="text-sm mt-1">Scan asset tags and serial numbers to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Scanned Pairs ({pairs.length})
        </h2>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-gray-600">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {uploadStatus && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">{uploadStatus}</p>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {pairs.map((pair) => (
          <div key={pair.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center space-x-4">
                <div>
                  <div className="text-sm text-gray-600">Asset Tag</div>
                  <div className="font-mono font-semibold">{pair.asset_tag}</div>
                </div>
                <div className="text-gray-400">•</div>
                <div>
                  <div className="text-sm text-gray-600">Serial</div>
                  <div className="font-mono font-semibold">{pair.serial}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center space-x-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(pair.status)}`}>
                  {getStatusText(pair.status)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(pair.scanned_at).toLocaleString()}
                </span>
              </div>
            </div>
            
            {pair.status === 'pending' && (
              <button
                onClick={() => deletePair(pair.id!)}
                className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete pair"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={uploadPairs}
        disabled={isUploading || pairs.filter(p => p.status === 'pending').length === 0}
        className={`w-full px-6 py-4 rounded-xl font-semibold text-lg transition-colors ${
          isUploading || pairs.filter(p => p.status === 'pending').length === 0
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : isOnline
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-orange-500 text-white hover:bg-orange-600'
        }`}
      >
        {isUploading 
          ? 'Uploading...' 
          : isOnline 
          ? `Upload ${pairs.filter(p => p.status === 'pending').length} Pairs`
          : `Queue ${pairs.filter(p => p.status === 'pending').length} Pairs (Offline)`
        }
      </button>

      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• Pairs are stored locally until uploaded</p>
        <p>• Upload will sync automatically when back online</p>
        <p>• Green status = successfully uploaded to server</p>
      </div>
    </div>
  );
};
