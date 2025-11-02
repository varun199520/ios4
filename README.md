# Asset Tracker PWA

An offline-first Progressive Web App for iOS that allows scanning and tracking asset tag and serial number pairs. Built with React, TypeScript, and optimized for iOS Safari.

## Features

- **Offline-First**: Works completely offline with automatic sync when connection is restored
- **Barcode Scanning**: Uses device camera to scan asset tags and serial numbers (no manual entry allowed)
- **iOS Optimized**: Designed specifically for iOS Safari with PWA capabilities
- **Secure Authentication**: JWT-based authentication with automatic token management
- **Asset Tag Validation**: Validates asset tags against server database
- **Search & Replace**: Find and replace serial numbers for hardware replacements
- **Background Sync**: Automatic upload when connection is restored
- **Touch-Friendly UI**: Large buttons and touch-optimized interface

## Requirements

- iOS 13+ (for full PWA support)
- Safari browser (for installation)
- Camera permission (for barcode scanning)
- HTTPS connection (required for PWA features)

## Installation on iPhone

1. Open Safari and navigate to your app URL
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" to install the app
5. Launch from your home screen for the full app experience

## Development Setup

### Install Dependencies

```bash
npm install
```

### Environment Configuration

```bash
cp .env.example .env
# Edit .env with your API server URL
```

### Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## Usage

### Login
- Enter your username and password
- Credentials are stored securely with JWT tokens
- Automatic token refresh and validation

### Scanning Pairs
1. Tap "Scan Asset Tag" and scan the asset tag barcode
2. Tap "Scan Serial Number" and scan the serial number barcode
3. Tap "Add Pair" to store locally
4. Repeat for additional pairs

### Upload Data
- Tap "Upload" to sync pairs with server
- If offline, pairs are queued for automatic upload
- Green status indicates successful upload
- Error messages show validation issues

### Search & Replace
- Use for hardware replacements
- Search by asset tag or serial number
- Replace serial numbers while keeping asset tag
- All changes are logged with timestamp and user

## Technical Details

### Offline Storage
- Uses IndexedDB for local data storage
- Service Worker for offline caching
- Background sync for automatic uploads

### Barcode Scanning
- Primary: BarcodeDetector API (iOS 17+)
- Fallback: ZXing library for older devices
- Supports multiple barcode formats

### PWA Features
- App manifest for installation
- Service worker for offline functionality
- iOS-specific meta tags and optimizations
- Safe area insets for modern iPhones

### Security
- No manual data entry allowed
- JWT authentication with automatic refresh
- HTTPS required for all features
- Asset tag validation against server database

## API Integration

The app expects a REST API with the following endpoints:

- `POST /api/auth/login` - User authentication
- `GET /api/asset-tags` - Fetch asset tag list
- `POST /api/pairs/batch` - Upload scanned pairs
- `GET /api/pairs/search` - Search existing pairs
- `PUT /api/pairs/replace` - Replace serial numbers

## Browser Support

- **iOS Safari**: Full support (recommended)
- **iOS Chrome**: Limited PWA features
- **Android**: Basic functionality (not optimized)

## Deployment

1. Build the app: `npm run build`
2. Deploy `dist/` folder to HTTPS server
3. Ensure proper MIME types for manifest.json
4. Configure server for SPA routing
5. Set up SSL certificate

## Troubleshooting

### Camera Not Working
- Ensure HTTPS connection
- Check camera permissions in Safari settings
- Try refreshing the page

### PWA Not Installing
- Must be accessed via Safari (not Chrome)
- Requires HTTPS connection
- Check manifest.json is accessible

### Offline Sync Issues
- Check network connectivity
- Verify service worker registration
- Clear browser cache if needed

## Development Notes

The lint errors shown during development are expected until dependencies are installed with `npm install`. The app is fully functional once dependencies are resolved.

## License

This project is designed for internal asset tracking use.
# ios
