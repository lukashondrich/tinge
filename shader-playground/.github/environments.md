# GitHub Environments Configuration

## Required GitHub Environments

You need to create these environments in your GitHub repository settings:

### 1. Staging Environment
- **Name**: `staging`
- **Protection Rules**: None (automatic deployment)
- **Secrets**:
  - `RAILWAY_TOKEN`: Same as main token
- **Environment Variables**:
  - `RAILWAY_SERVICE_FRONTEND`: `frontend-staging`
  - `RAILWAY_SERVICE_BACKEND`: `backend-staging`

### 2. Production Environment
- **Name**: `production`
- **Protection Rules**: 
  - ✅ Required reviewers: `lukashondrich`
  - ✅ Wait timer: 0 minutes
  - ✅ Restrict pushes that create deployments: `main` branch only
- **Secrets**:
  - `RAILWAY_TOKEN`: Same as main token
- **Environment Variables**:
  - `RAILWAY_SERVICE_FRONTEND`: `tinge_frontend`
  - `RAILWAY_SERVICE_BACKEND`: `tinge_backend`

## How to Create Environments

1. Go to your repository: https://github.com/lukashondrich/tinge
2. Navigate to Settings → Environments
3. Click "New environment"
4. Create both `staging` and `production` environments
5. Configure protection rules for production
6. Add the required secrets and variables

## Environment URLs

- **Staging Frontend**: https://frontend-staging-production.up.railway.app
- **Staging Backend**: https://backend-staging-production.up.railway.app
- **Production Frontend**: https://tingefrontend-production.up.railway.app
- **Production Backend**: https://tingebackend-production.up.railway.app