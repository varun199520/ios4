# Quick Setup Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` if you need to change the API server URL.

## 3. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## 4. Test on iPhone

1. Make sure your iPhone is on the same network as your development machine
2. Find your computer's IP address (e.g., `192.168.1.100`)
3. Open Safari on your iPhone and go to `http://192.168.1.100:5173`
4. Tap Share → Add to Home Screen to install the PWA

## 5. Build for Production

```bash
npm run build
```

The built files will be in the `dist/` folder, ready to deploy to any HTTPS server.

## Features Included

✅ **Offline-first PWA** - Works without internet, syncs when online  
✅ **Barcode scanning** - BarcodeDetector API + ZXing fallback  
✅ **iOS optimized** - PWA manifest, safe areas, touch-friendly UI  
✅ **Authentication** - JWT tokens with automatic refresh  
✅ **Asset validation** - Checks against server database  
✅ **Search & replace** - Hardware replacement workflow  
✅ **Background sync** - Automatic upload when connection restored  

## Next Steps

- Deploy to HTTPS server for production use
- Configure your backend API server
- Add real asset tag data to the database
- Customize branding and styling as needed

The lint errors shown in the IDE will resolve once you run `npm install`.
