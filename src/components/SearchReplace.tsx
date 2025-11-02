import React, { useState } from 'react';
import { ScanButton } from '../scanner';
import { api } from '../api';

interface SearchReplaceProps {
  onClose: () => void;
}

export const SearchReplace: React.FC<SearchReplaceProps> = ({ onClose }) => {
  const [searchValue, setSearchValue] = useState<string>('');
  const [searchType, setSearchType] = useState<'asset_tag' | 'serial'>('asset_tag');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [newSerial, setNewSerial] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const handleSearch = async () => {
    if (!searchValue.trim()) {
      setMessage('Please scan a value to search');
      setMessageType('error');
      return;
    }

    setIsSearching(true);
    setMessage('');
    setSearchResult(null);

    try {
      const query = searchType === 'asset_tag' 
        ? { asset_tag: searchValue.trim() }
        : { serial: searchValue.trim() };
      
      const result = await api.searchPair(query);
      setSearchResult(result);
      
      if (result.status === 'unused') {
        setMessage('Asset tag is unused - no replacement needed');
        setMessageType('success');
      } else {
        setMessage(`Found: Asset tag ${result.asset_tag} is used with serial ${result.serial}`);
        setMessageType('success');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Search failed');
      setMessageType('error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleReplace = async () => {
    if (!searchResult || !newSerial.trim()) {
      setMessage('Please scan a new serial number');
      setMessageType('error');
      return;
    }

    setIsReplacing(true);
    setMessage('');

    try {
      const replaceRequest = {
        searchBy: 'asset_tag' as const,
        value: searchResult.asset_tag,
        new_serial: newSerial.trim()
      };

      const result = await api.replacePair(replaceRequest);
      
      if (result.success) {
        setMessage(`Successfully updated asset tag ${searchResult.asset_tag} with new serial ${newSerial}`);
        setMessageType('success');
        
        // Reset form after successful replacement
        setTimeout(() => {
          setSearchValue('');
          setNewSerial('');
          setSearchResult(null);
        }, 2000);
      } else {
        setMessage(result.message || 'Replacement failed');
        setMessageType('error');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Replacement failed');
      setMessageType('error');
    } finally {
      setIsReplacing(false);
    }
  };

  const clearForm = () => {
    setSearchValue('');
    setNewSerial('');
    setSearchResult(null);
    setMessage('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Search & Replace</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search Section */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search by:
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="asset_tag"
                    checked={searchType === 'asset_tag'}
                    onChange={(e) => setSearchType(e.target.value as 'asset_tag')}
                    className="mr-2"
                  />
                  Asset Tag
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="serial"
                    checked={searchType === 'serial'}
                    onChange={(e) => setSearchType(e.target.value as 'serial')}
                    className="mr-2"
                  />
                  Serial Number
                </label>
              </div>
            </div>

            <ScanButton
              label={`Scan ${searchType === 'asset_tag' ? 'Asset Tag' : 'Serial Number'}`}
              onResult={setSearchValue}
              value={searchValue}
              disabled={isSearching || isReplacing}
            />

            {/* Manual Input for Testing */}
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-700 mb-2">💻 Manual Input:</p>
              <input
                type="text"
                placeholder={`Enter ${searchType === 'asset_tag' ? 'Asset Tag (e.g., AT001)' : 'Serial Number (e.g., SN123456)'}`}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={isSearching || isReplacing}
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={!searchValue.trim() || isSearching}
              className={`w-full px-4 py-3 rounded-xl font-semibold transition-colors ${
                !searchValue.trim() || isSearching
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search Results */}
          {searchResult && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Search Result:</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Asset Tag:</span>
                  <span className="ml-2 font-mono">{searchResult.asset_tag}</span>
                </div>
                {searchResult.serial && (
                  <div>
                    <span className="text-gray-600">Current Serial:</span>
                    <span className="ml-2 font-mono">{searchResult.serial}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Status:</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                    searchResult.status === 'used' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {searchResult.status}
                  </span>
                </div>
              </div>

              {searchResult.history && searchResult.history.length > 0 && (
                <div className="mt-3">
                  <span className="text-gray-600 text-sm">History:</span>
                  <div className="mt-1 space-y-1">
                    {searchResult.history.map((entry: any, index: number) => (
                      <div key={index} className="text-xs text-gray-500">
                        {entry.serial} - {new Date(entry.assigned_at).toLocaleDateString()} by {entry.assigned_by}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Replace Section */}
          {searchResult && searchResult.status === 'used' && (
            <div className="space-y-4 mb-6">
              <h3 className="font-semibold text-gray-900">Replace Serial Number:</h3>
              
              <ScanButton
                label="Scan New Serial Number"
                onResult={setNewSerial}
                value={newSerial}
                disabled={isReplacing}
              />

              {/* Manual Input for New Serial */}
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-700 mb-2">💻 Manual Input:</p>
                <input
                  type="text"
                  placeholder="Enter New Serial Number (e.g., SN789012)"
                  value={newSerial}
                  onChange={(e) => setNewSerial(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  disabled={isReplacing}
                />
              </div>

              <button
                onClick={handleReplace}
                disabled={!newSerial.trim() || isReplacing}
                className={`w-full px-4 py-3 rounded-xl font-semibold transition-colors ${
                  !newSerial.trim() || isReplacing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {isReplacing ? 'Replacing...' : 'Replace Serial Number'}
              </button>
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`p-3 rounded-lg mb-4 ${
              messageType === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              <p className="text-sm">{message}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              onClick={clearForm}
              className="flex-1 px-4 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600"
            >
              Clear
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600"
            >
              Done
            </button>
          </div>

          <div className="mt-4 text-xs text-gray-500 space-y-1">
            <p>• Search for existing asset tags or serial numbers</p>
            <p>• Replace serial numbers when hardware is changed</p>
            <p>• All changes are logged with timestamp and user</p>
          </div>
        </div>
      </div>
    </div>
  );
};
