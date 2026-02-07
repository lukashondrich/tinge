# Local Review Checklist

Use this when reviewing onboarding and demo-seed behavior.

## 1) Start the app locally

From repository root:

```bash
npm install
npm run install:all
cd embedding-service && npm run setup:python && cd ..
npm run dev
```

Expected local services:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Embedding service: `http://localhost:3001`

## 2) First-load onboarding checks

1. Open `http://localhost:5173` in a fresh/private window.
2. Confirm onboarding overlay appears with:
   - hold-to-talk instructions
   - memory explanation
   - `Use Demo Cloud`, `Start Fresh`, `Close` buttons
3. Click `Use Demo Cloud`:
   - page reloads
   - cloud is pre-populated
4. Click `Close`:
   - overlay stays hidden on refresh for that browser profile.

## 3) Empty-state checks

1. Reopen onboarding (or clear local storage manually).
2. Click `Start Fresh`.
3. Confirm:
   - page reloads
   - cloud starts empty
   - speaking begins to add words gradually.

## 4) Voice interaction checks

1. Allow microphone access.
2. Press and hold `Push to Talk`.
3. Speak while holding, then release.
4. Confirm:
   - transcript bubbles appear
   - AI responds in audio/text
   - words are added to the 3D map.

## 5) Optional debugging reset

In browser console:

```js
localStorage.removeItem('tinge-onboarding-dismissed');
localStorage.removeItem('tinge-demo-seed-enabled');
localStorage.removeItem('tinge-vocabulary');
location.reload();
```
