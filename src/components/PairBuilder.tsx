import React, { useState } from 'react';
import { ScanButton } from '../scanner';
import { dbHelpers } from '../db';
import { api } from '../api';

interface PairBuilderProps {
  onPairAdded: () => void;
  addToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const PairBuilder: React.FC<PairBuilderProps> = ({ onPairAdded, addToast }) => {
  const [assetTag, setAssetTag] = useState<string>('');
  const [serial, setSerial] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isValidating, setIsValidating] = useState(false);
  // Upload dialog variables kept for backward compatibility
  const [pendingPair, setPendingPair] = useState<{ assetTag: string; serial: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  // Dialog shown when scanned asset tag is not present in the back-end list
  const [showMissingTagDialog, setShowMissingTagDialog] = useState(false);

  const canAddPair = assetTag.trim() && serial.trim();

  const validateAndAddPair = async () => {
    if (!canAddPair) {
      setError('Both Asset Tag and Serial Number are required');
      return;
    }

    setIsValidating(true);
    setError('');
    setSuccess('');

    try {
      // Check if asset tag exists in local cache
      let assetTagInfo = await dbHelpers.getAssetTag(assetTag.trim());
      
      // If asset tag is unknown, ask user for confirmation instead of silently creating it
      if (!assetTagInfo) {
        setShowMissingTagDialog(true);
        setIsValidating(false);
        return;
      }

      // Check if asset tag is already used with a different serial
      if (assetTagInfo && assetTagInfo.status === 'used' && 
          assetTagInfo.last_serial && 
          assetTagInfo.last_serial !== serial.trim()) {
        setError(`Asset tag already used with serial: ${assetTagInfo.last_serial}`);
        setIsValidating(false);
        return;
      }

      // Store pair locally as pending
      await dbHelpers.addPair(assetTag.trim(), serial.trim());

      const successMessage = `Pair saved: ${assetTag.trim()} → ${serial.trim()}`;
      setSuccess(`✅ ${successMessage}`);
      addToast?.(successMessage, 'success');

      // Reset form after short delay
      setTimeout(() => {
        setAssetTag('');
        setSerial('');
        setSuccess('');
      }, 1500);

      onPairAdded();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add pair';
      setError(errorMessage);
      addToast?.(errorMessage, 'error');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAssetTagScan = (value: string) => {
    setAssetTag(value);
    setError('');
    setSuccess('');
  };

  const handleSerialScan = (value: string) => {
    setSerial(value);
    setError('');
    setSuccess('');
  };

  const handleUploadToServer = async () => {
    if (!pendingPair) return;

    setIsUploading(true);
    setError('');
    setSuccess('');

    try {
      // Upload to server
      const uploadData = [{
        asset_tag: pendingPair.assetTag,
        serial: pendingPair.serial,
        scanned_at: new Date().toISOString()
      }];

      const results = await api.uploadPairs(uploadData);
      const result = results[0];

      if (result.status === 'ok_inserted' || result.status === 'ok_overwrite_same_pair') {
        // Mark local pair as uploaded
        await dbHelpers.updatePairStatus(pendingPair.assetTag, pendingPair.serial, 'uploaded');
        
        const successMessage = `Pair uploaded to server: ${pendingPair.assetTag} → ${pendingPair.serial}`;
        setSuccess(`✅ ${successMessage}`);
        addToast?.(successMessage, 'success');

        // Reset form and close dialog
        setTimeout(() => {
          setAssetTag('');
          setSerial('');
          setSuccess('');
          setShowUploadDialog(false);
          setPendingPair(null);
        }, 2000);

        onPairAdded();
      } else {
        setError(`Upload failed: ${result.message || result.status}`);
        addToast?.(`Upload failed: ${result.message || result.status}`, 'error');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      addToast?.(errorMessage, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveLocally = async () => {
    if (!pendingPair) return;

    try {
      // Pair already saved locally; just keep pending status
      const successMessage = `Pair saved locally: ${pendingPair.assetTag} → ${pendingPair.serial}`;
      setSuccess(`✅ ${successMessage} (will sync when online)`);
      addToast?.(successMessage + ' (will sync when online)', 'info');

      // Reset form and close dialog
      setTimeout(() => {
        setAssetTag('');
        setSerial('');
        setSuccess('');
        setShowUploadDialog(false);
        setPendingPair(null);
      }, 2000);

      onPairAdded();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save locally';
      setError(errorMessage);
      addToast?.(errorMessage, 'error');
    }
  };

  const clearPair = () => {
    setAssetTag('');
    setSerial('');
    setError('');
    setSuccess('');
    setShowUploadDialog(false);
    setPendingPair(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Scan New Pair</h2>
      
      <div className="space-y-4">
        {/* Manual Input Fields - Primary for Laptop Testing */}
        <div className="space-y-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700 font-medium">💻 Laptop Testing - Manual Input:</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asset Tag:</label>
              <input
                type="text"
                placeholder="Enter Asset Tag (e.g., AT001)"
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isValidating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number:</label>
              <input
                type="text"
                placeholder="Enter Serial Number (e.g., SN123456)"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isValidating}
              />
            </div>
          </div>
        </div>

        {/* Camera Scanning - For Mobile Devices */}
        <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700 font-medium">📱 Mobile Camera Scanning:</p>
          <div className="space-y-2">
            <ScanButton
              label="Scan Asset Tag"
              onResult={handleAssetTagScan}
              value={assetTag}
              disabled={isValidating}
            />
            
            <ScanButton
              label="Scan Serial Number"
              onResult={handleSerialScan}
              value={serial}
              disabled={isValidating}
            />
          </div>
        </div>
        

      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-600 font-medium">{success}</p>
        </div>
      )}

      <div className="mt-6 flex space-x-3">
        <button
          onClick={validateAndAddPair}
          disabled={!canAddPair || isValidating}
          className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-colors ${
            !canAddPair || isValidating
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
        >
          {isValidating ? 'Validating...' : 'Add Pair'}
        </button>
        
        {(assetTag || serial) && (
          <button
            onClick={clearPair}
            disabled={isValidating}
            className="px-4 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• Both Asset Tag and Serial Number are required</p>
        <p>• Use camera scanning on mobile devices</p>
        <p>• Use manual input for laptop testing</p>
        <p>• Asset tags: AT001-AT005 are available in the system</p>
      </div>

      {/* Missing-tag confirmation dialog */}
      {showMissingTagDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Asset Tag Not Found</h3>
              <p className="text-sm text-gray-700">Asset Tag <strong>{assetTag}</strong> isn’t in the back-end. Add it as <em>unused</em> and continue?</p>
              <div className="flex space-x-3">
                <button
                  onClick={async () => {
                    setShowMissingTagDialog(false);
                    // Create new unused tag then retry validation
                    await dbHelpers.updateAssetTag(assetTag.trim(), 'unused');
                    validateAndAddPair();
                  }}
                  className="flex-1 px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600"
                >
                  Yes, add tag
                </button>
                <button
                  onClick={() => setShowMissingTagDialog(false)}
                  className="flex-1 px-4 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Confirmation Dialog */}
      {/* Upload prompt removed */}
      {false && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Pair to Server?</h3>
                <div className="p-4 bg-blue-50 rounded-lg mb-4">
                  <div className="text-sm text-gray-700">
                    <div><strong>Asset Tag:</strong> {pendingPair?.assetTag ?? ''}</div>
                    <div><strong>Serial Number:</strong> {pendingPair?.serial ?? ''}</div>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Choose how to save this pair:
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleUploadToServer}
                  disabled={isUploading}
                  className={`w-full px-4 py-3 rounded-xl font-semibold transition-colors ${
                    isUploading
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {isUploading ? 'Uploading...' : '🌐 Upload to Server'}
                </button>

                <button
                  onClick={handleSaveLocally}
                  disabled={isUploading}
                  className={`w-full px-4 py-3 rounded-xl font-semibold transition-colors ${
                    isUploading
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  💾 Save Locally Only
                </button>

                <button
                  onClick={() => setShowUploadDialog(false)}
                  disabled={isUploading}
                  className="w-full px-4 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-4 text-xs text-gray-500 space-y-1">
                <p>• <strong>Upload to Server:</strong> Saves immediately to database</p>
                <p>• <strong>Save Locally:</strong> Stores offline, syncs when online</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
