# Three.js Playground

A Three.js playground application with AI-powered features, including real-time audio processing and semantic embeddings.

## 🚀 Live Demo

**Try it now**: https://tingefrontend-production.up.railway.app

The live application includes:
- Interactive Three.js scene with semantic word visualization
- OpenAI Realtime API integration for voice interactions
- Real-time speech-to-text and AI responses
- Dynamic 3D word cloud with physics simulation

## Architecture

This is a multi-service application consisting of:

- **Frontend** (`shader-playground/`): Vite + Three.js application
- **Backend** (`backend/`): Node.js/Express API server
- **Embedding Service** (`embedding-service/`): Python/Node.js hybrid service for AI embeddings

## Development Setup

### Prerequisites

- Node.js 18+ 
- Python 3.9+
- Docker & Docker Compose (for containerized development)

### Local Development

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd threejs_playground
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Install dependencies for all services:**
   ```bash
   npm run install:all
   ```

4. **Start development servers:**
   ```bash
   npm run dev
   ```

   This will start:
   - Frontend on http://localhost:5173
   - Backend on http://localhost:3000  
   - Embedding service on http://localhost:3001

### Docker Development

1. **Build and start with Docker:**
   ```bash
   npm run docker:build
   npm run docker:up
   ```

2. **View logs:**
   ```bash
   npm run docker:logs
   ```

3. **Stop services:**
   ```bash
   npm run docker:down
   ```

## CI/CD Pipeline

### GitHub Actions Workflows

1. **CI Pipeline** (`.github/workflows/ci.yml`)
   - Runs on push/PR to main/develop branches
   - Tests across Node.js 18.x and 20.x
   - Runs linting, tests, security audits
   - Builds Docker images for testing

2. **Build & Deploy** (`.github/workflows/build-images.yml`)
   - Manual trigger or on main branch push
   - Builds and pushes Docker images to GitHub Container Registry
   - Generates deployment manifests

### Testing

- **Unit Tests**: `npm test`
- **Backend Tests**: `npm run test:backend` 
- **Frontend Tests**: `npm run test:frontend`
- **Coverage**: `npm run test:coverage`

### Linting

- **All Services**: `npm run lint`
- **Fix Issues**: `npm run lint:fix`

## Deployment

### Environment Setup

1. **Staging**: Uses `.env.staging`
2. **Production**: Uses `.env.production`

### Docker Deployment

The application is containerized and can be deployed to any Docker-compatible platform:

1. **Build images:**
   ```bash
   docker-compose -f docker-compose.prod.yml build
   ```

2. **Deploy:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Production Deployment

**Current Live Deployment**: Railway.app

The application is currently deployed on Railway with the following services:
- **Frontend**: https://tingefrontend-production.up.railway.app
- **Backend API**: https://tingebackend-production.up.railway.app

**Alternative Deployment Platforms**:
- AWS ECS/Fargate
- Google Cloud Run
- Azure Container Instances  
- DigitalOcean App Platform
- Render, Vercel, or similar platforms

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Environment Variables

### Required Variables

```bash
# Backend
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
NODE_ENV=development

# Add database URL when implemented
# DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### Optional Variables

```bash
# Security
JWT_SECRET=your_jwt_secret_here

# External Services
WEBHOOK_URL=https://your-webhook-url.com
```

## API Endpoints

### Backend (Port 3000)
- `GET /health` - Health check
- `POST /token` - OpenAI token endpoint
- `POST /transcribe` - Audio transcription

### Embedding Service (Port 3001)  
- `GET /health` - Health check
- `POST /embed-word` - Generate word embeddings

## Development Scripts

```bash
# Development
npm run dev                 # Start all services
npm run dev:backend        # Backend only
npm run dev:frontend       # Frontend only  
npm run dev:embedding      # Embedding service only

# Testing
npm test                   # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage

# Linting
npm run lint              # Lint all services
npm run lint:fix          # Fix linting issues

# Docker
npm run docker:build      # Build containers
npm run docker:up         # Start containers
npm run docker:down       # Stop containers
npm run docker:logs       # View logs
```

## Contributing

1. Create feature branch from `develop`
2. Make changes with tests
3. Run `npm run lint` and `npm test`
4. Create pull request to `develop`

## License

[Add your license information here]# Force Railway rebuild
