# Claude Development Notes

## Railway Deployment Configuration

This project has a **non-standard Railway setup**:

- **Environment**: "production" (only one environment)
- **Services**: "staging" and "production" (both services exist within the production environment)

### Deployment Commands

#### Deploy to Staging Service:
```bash
# Backend
cd /Users/user01/threejs_playground/backend
railway environment production
railway up --service backend-staging

# Frontend  
cd /Users/user01/threejs_playground/shader-playground
railway environment production
railway up --service frontend-staging
```

#### Deploy to Production Service (after testing staging):
```bash
# Backend
cd /Users/user01/threejs_playground/backend
railway environment production
railway up --service backend-production

# Frontend
cd /Users/user01/threejs_playground/shader-playground
railway environment production
railway up --service frontend-production
```

#### Check Service Names:
```bash
railway service list
```

**Important**: Always deploy to staging service first, test thoroughly, then deploy to production service.

## Language Detection Features

- Word-level language detection with FastText fallback
- Language metadata stored with vocabulary in localStorage
- Caching system to avoid duplicate API calls
- Common word recognition for Spanish, French, German, Italian

### Testing Language Detection:
```bash
curl "http://localhost:3000/detect-language?text=gracias"  # Should return Spanish
curl "http://localhost:3000/detect-language?text=bonjour"  # Should return French
```

## Development Servers

### Local Development:
```bash
# Terminal 1 - Backend
cd /Users/user01/threejs_playground/backend
node server.js

# Terminal 2 - Frontend
cd /Users/user01/threejs_playground/shader-playground
npm run dev
```

### Endpoints:
- Backend: http://localhost:3000
- Frontend: http://localhost:5173 (or next available port)
- Health check: http://localhost:3000/health
- Language detection: http://localhost:3000/detect-language?text=word
- Word embedding: http://localhost:3000/embed-word?word=word