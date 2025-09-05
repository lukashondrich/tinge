# Language Detection Feature

> **⚠️ Experimental Feature**: This feature is under development in the `language-detection-wip` branch and is not included in the main production application.

## Branch Status

- **Main branch**: Stable, production-ready core features only
- **Development branch**: `language-detection-wip` - Contains all language detection implementation
- **Status**: Work in progress - returns "fallback" responses instead of proper language detection

## Quick Start (Development)

To work on this feature:

```bash
git checkout language-detection-wip
cd backend
npm install
pip install -r requirements.txt
npm run dev
```

## Overview

The language detection feature provides word-level language identification to support vocabulary learning in the Three.js conversation app. Users can see which language detected words belong to, helping with multilingual vocabulary building.

## Current Issue

**Problem**: Language detection returns "fallback" responses instead of proper language detection results.

**Expected**: `{"language": "es", "confidence": 0.9}` for Spanish words like "gracias"
**Actual**: `{"language": "en", "confidence": 0.5, "source": "fallback"}`

## Architecture (in development branch)

### Frontend Integration
- **Location**: `shader-playground/src/utils/languageDetection.js`
- **Caching**: Uses `vocabularyStorage.js` for localStorage-based result caching
- **API URL**: Uses Vite build-time constant `__API_URL__`

### Backend API
- **Endpoint**: `GET /detect-language?text={word}`
- **Location**: `backend/server.js:202-231`
- **Process**: Spawns Python subprocess for language detection

### Python Service
- **Location**: `backend/src/services/simple_embedding.py`
- **Mode**: Rule-based detection (FastText removed due to Docker compilation issues)
- **Languages**: Spanish, French, German, Italian, English (default)

## Implementation Details

### Language Detection Logic

The Python service uses a hybrid approach:

1. **Dictionary Lookup**: Common words by language
2. **Pattern Matching**: Character patterns and word endings
3. **Diacritic Detection**: Special characters by language

### Debug Infrastructure

Debug logging is available in the development branch:
- Backend request logging
- Python communication tracing  
- Response validation
- Fallback condition detection

## Testing Environment

### Development Branch Testing
```bash
git checkout language-detection-wip
# Test locally or deploy to personal staging environment
```

### Test Words
- **Spanish**: "gracias", "resulta", "hola", "por favor"
- **French**: "bonjour", "merci", "comment allez vous"
- **German**: "hallo", "danke", "wie geht es ihnen"

## Next Steps

1. **Checkout development branch**: `git checkout language-detection-wip`
2. **Debug the Node.js ↔ Python communication** using provided logging
3. **Identify where "fallback" responses are generated**
4. **Fix the communication pipeline**
5. **Test thoroughly before considering merge to main**

## Why This Feature Is In A Separate Branch

- **Main branch stability**: Keeps production deployments stable
- **Experimental nature**: Feature has known issues that need debugging
- **Complex dependencies**: Involves Python subprocess management and Docker complexity
- **Auto-deployment safety**: Prevents broken features from disrupting staging/production

## Future Integration

Once the feature is working properly in the development branch:
1. Thorough testing and validation
2. Create pull request for review
3. Merge to main only when fully functional
4. Update this documentation to reflect production status

## File Locations (in development branch)

### Core Files
- `backend/server.js` - Main API endpoint
- `backend/src/services/simple_embedding.py` - Python detection service
- `shader-playground/src/utils/languageDetection.js` - Frontend integration

### Configuration
- `backend/Dockerfile` - Python environment setup
- `backend/requirements.txt` - Python dependencies
- `shader-playground/vite.config.js` - API URL configuration