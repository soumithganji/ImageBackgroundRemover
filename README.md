# Background Remover

A full-stack application that removes image backgrounds using AI and applies horizontal flipping, with cloud storage and Vercel deployment.

## Project Structure

```
Background Remover/
├── backend/           # Express TypeScript API
│   ├── src/
│   │   ├── index.ts           # Express server
│   │   └── lib/
│   │       ├── removebg.ts    # Clipdrop API client
│   │       ├── imageProcessor.ts  # Sharp image flip
│   │       └── storage.ts     # GCS client
│   ├── package.json
│   └── vercel.json
│
├── frontend/          # Vite React TypeScript
│   ├── src/
│   │   ├── App.tsx            # Main app component
│   │   ├── main.tsx           # Entry point
│   │   ├── globals.css        # Glassmorphism styles
│   │   └── components/
│   │       ├── ImageUploader.tsx
│   │       ├── ImageDisplay.tsx
│   │       └── ActionButtons.tsx
│   ├── package.json
│   └── vercel.json
│
└── package.json       # Root scripts
```

## Features

- **Image Upload**: Drag-and-drop or click to upload JPEG, PNG, or WebP images
- **Background Removal**: AI-powered background removal via Clipdrop API
- **Horizontal Flip**: Automatically flips processed images horizontally
- **Cloud Storage**: Images hosted on Google Cloud Storage with public URLs
- **View Toggle**: Switch between original and processed images
- **Delete**: Remove images from cloud storage

## Tech Stack

**Backend:**
- Express.js with TypeScript
- Sharp (image processing)
- Clipdrop API (background removal)
- Google Cloud Storage

**Frontend:**
- Vite + React + TypeScript
- Vanilla CSS with glassmorphism design

## Setup

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install all project dependencies
npm run install:all
```

### 2. Configure Backend Environment

Copy `backend/env.example` to `backend/.env`:

```env
CLIPDROP_API_KEY=your_api_key_here
GCS_PROJECT_ID=your_project_id
GCS_BUCKET_NAME=your_bucket_name
```

For **local development**, authenticate with:
```bash
gcloud auth application-default login
```

### 3. Configure Frontend Environment (Optional)

Copy `frontend/env.example` to `frontend/.env`:

```env
# For production, set this to your deployed backend URL
VITE_API_URL=https://your-backend.vercel.app
```

### 4. Run Development Servers

```bash
# Run both frontend and backend
npm run dev

# Or run separately:
npm run dev:backend    # Starts on http://localhost:3001
npm run dev:frontend   # Starts on http://localhost:3000 (proxies /api to backend)
```

## Deployment to Vercel

### Deploy Backend

```bash
cd backend
vercel --prod
```

Set environment variables in Vercel dashboard:
- `CLIPDROP_API_KEY`
- `GCS_PROJECT_ID`
- `GCS_BUCKET_NAME`

For GCS auth, configure **Workload Identity Federation (WIF)** with Vercel's OIDC provider.

### Deploy Frontend

```bash
cd frontend
vercel --prod
```

Set environment variable:
- `VITE_API_URL` = your backend Vercel URL

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/health` | GET | Health check |
| `POST /api/upload` | POST | Upload and process image |
| `DELETE /api/delete?imageId={id}` | DELETE | Delete images |
| `GET /api/images/:id` | GET | Get image URLs by ID |

## GCS Bucket Setup

1. Create a new bucket in Google Cloud Console
2. Enable public access:
   - Remove "Prevent public access" restriction
   - Add `allUsers` with "Storage Object Viewer" role
3. Create a service account with "Storage Object Admin" role
4. Generate and download the JSON key file
5. Copy credentials to backend `.env` file

## License

MIT
