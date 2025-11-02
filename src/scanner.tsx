import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { createWorker } from 'tesseract.js';

interface ScannerProps {
  onResult: (value: string) => void;
  onError?: (error: string) => void;
  isActive: boolean;
}

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

export const Scanner: React.FC<ScannerProps> = ({ onResult, onError, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.reset();
    }
    setIsScanning(false);
  }, []);

  const startScanning = useCallback(async () => {
    if (!videoRef.current || isScanning) return;

    try {
      setError('');
      setIsScanning(true);

      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Try multiple detection methods
      if (window.BarcodeDetector) {
        await scanWithBarcodeDetector();
      } else {
        // Fallback to ZXing for barcodes
        await scanWithZXing();
      }
      
      // Also try OCR for text/numbers
      await scanWithOCR();
    } catch (err) {
      let errorMessage = 'Camera access denied or not available';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Camera permission denied. Please allow camera access and try again.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No camera found. Use manual input for testing on laptop.';
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'Camera is being used by another application.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
      onError?.(errorMessage);
      setIsScanning(false);
    }
  }, [isScanning, onError]);

  const scanWithBarcodeDetector = useCallback(async () => {
    if (!videoRef.current || !window.BarcodeDetector) return;

    try {
      const detector = new window.BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'code_93']
      });

      const scanLoop = async () => {
        if (!videoRef.current || !isScanning) return;

        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const result = barcodes[0].rawValue.trim();
            if (result) {
              onResult(result);
              stopStream();
              return;
            }
          }
        } catch (err) {
          console.warn('Barcode detection error:', err);
        }

        // Continue scanning
        if (isScanning) {
          requestAnimationFrame(scanLoop);
        }
      };

      scanLoop();
    } catch (err) {
      console.error('BarcodeDetector failed:', err);
      // Fallback to ZXing
      await scanWithZXing();
    }
  }, [isScanning, onResult, stopStream]);

  const scanWithZXing = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
      }

      const result = await readerRef.current.decodeOnceFromVideoDevice(
        undefined,
        videoRef.current
      );

      if (result) {
        onResult(result.getText().trim());
        stopStream();
      }
    } catch (err) {
      console.error('ZXing scanning failed:', err);
      setError('Scanning failed. Please try again.');
      onError?.('Scanning failed. Please try again.');
    }
  }, [onResult, stopStream, onError]);

  const scanWithOCR = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      // Create a canvas to capture the video frame
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;

      const scanLoop = async () => {
        if (!videoRef.current || !isScanning) return;

        try {
          // Draw current video frame to canvas
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          
          // Convert canvas to blob for Tesseract
          canvas.toBlob(async (blob) => {
            if (!blob) return;

            try {
              // Create Tesseract worker
              const worker = await createWorker('eng');
              
              // Configure for better number/text recognition
              await worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
              });

              // Perform OCR
              const { data: { text } } = await worker.recognize(blob);
              await worker.terminate();

              if (text && text.trim().length > 0) {
                // Clean up the detected text
                const cleanText = text.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
                
                // Filter for patterns that look like asset tags or serial numbers
                const patterns = cleanText.match(/[A-Z]{2,3}\d{3,6}|[A-Z]{2}\d{3,6}|\d{6,12}|[A-Z]{2,4}-?\d{3,6}/g);
                
                if (patterns && patterns.length > 0) {
                  const result = patterns[0].trim();
                  if (result.length >= 4) { // Minimum length for valid codes
                    onResult(result);
                    stopStream();
                    return;
                  }
                } else if (cleanText.length >= 4 && cleanText.length <= 15) {
                  // Accept any clean alphanumeric string of reasonable length
                  onResult(cleanText);
                  stopStream();
                  return;
                }
              }
            } catch (ocrError) {
              console.warn('OCR processing error:', ocrError);
            }
          }, 'image/jpeg', 0.8);

        } catch (err) {
          console.warn('OCR detection error:', err);
        }

        // Continue scanning
        if (isScanning) {
          setTimeout(() => requestAnimationFrame(scanLoop), 2000); // Slower for OCR processing
        }
      };

      scanLoop();
    } catch (err) {
      console.error('OCR scanning failed:', err);
    }
  }, [isScanning, onResult, stopStream]);

  useEffect(() => {
    if (isActive && !isScanning) {
      startScanning();
    } else if (!isActive && isScanning) {
      stopStream();
    }

    return () => {
      stopStream();
    };
  }, [isActive, isScanning, startScanning, stopStream]);

  if (!isActive) {
    return null;
  }

  return (
    <div className="relative w-full h-64 bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />
      
      {/* Scanning overlay */}
      <div className="absolute inset-0 border-2 border-blue-500 rounded-lg">
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-32 border-2 border-red-500 rounded-lg">
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg"></div>
        </div>
      </div>

      {/* Status overlay */}
      <div className="absolute bottom-4 left-4 right-4 text-center">
        {isScanning && (
          <div className="bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg">
            <div className="animate-pulse">Scanning for barcodes and text...</div>
          </div>
        )}
        {error && (
          <div className="bg-red-500 bg-opacity-90 text-white px-3 py-2 rounded-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

interface ScanButtonProps {
  label: string;
  onResult: (value: string) => void;
  disabled?: boolean;
  value?: string;
}

export const ScanButton: React.FC<ScanButtonProps> = ({ 
  label, 
  onResult, 
  disabled = false, 
  value 
}) => {
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = () => {
    if (disabled) return;
    setIsScanning(true);
  };

  const handleResult = (result: string) => {
    setIsScanning(false);
    onResult(result);
  };

  const handleError = (error: string) => {
    setIsScanning(false);
    console.error('Scan error:', error);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleScan}
        disabled={disabled || isScanning}
        className={`w-full px-6 py-4 rounded-xl font-semibold text-lg transition-colors ${
          disabled || isScanning
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : value
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {isScanning ? 'Scanning...' : value ? `✓ ${label}` : label}
      </button>

      {value && (
        <div className="p-3 bg-gray-100 rounded-lg">
          <div className="text-sm text-gray-600 mb-1">{label}:</div>
          <div className="font-mono text-lg break-all">{value}</div>
        </div>
      )}

      {isScanning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold">{label}</h3>
              <p className="text-gray-600">Position the barcode in the frame</p>
            </div>
            
            <Scanner
              isActive={isScanning}
              onResult={handleResult}
              onError={handleError}
            />
            
            <button
              onClick={() => setIsScanning(false)}
              className="w-full mt-4 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
