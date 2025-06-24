# Production Deployment Guide

This guide will help you deploy your Three.js Playground to Railway.app for family and friends testing.

## 🚀 Railway.app Deployment

### Prerequisites
1. [Railway.app account](https://railway.app) (free tier available)
2. GitHub account with this repository
3. OpenAI API key
4. Railway CLI (optional, for advanced deployment)

### Step 0: Install Railway CLI (Optional)
```bash
# Install Railway CLI globally
npm install -g @railway/cli

# Login to Railway
railway login
```

### Step 1: Prepare for Deployment

1. **Create production environment file:**
   ```bash
   cp .env.production.example .env.production
   ```

2. **Fill in your OpenAI API key:**
   ```bash
   # Edit .env.production
   OPENAI_API_KEY=your_actual_openai_api_key_here
   ```

### Step 2: Deploy to Railway

#### Option A: Deploy All Services from One Repository (Recommended)

1. **Connect to Railway:**
   - Go to [railway.app](https://railway.app)
   - Sign up/in with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `threejs_playground` repository

2. **Deploy Backend Service:**
   - Railway will detect your repository
   - Click "Add Service" → "GitHub Repo"
   - Set **Root Directory**: `backend`
   - Set **Start Command**: `node server.js`
   - Add environment variables:
     ```
     OPENAI_API_KEY=your_key_here
     NODE_ENV=production
     ```

3. **Deploy Frontend Service:**
   - Click "Add Service" → "GitHub Repo" (same repo)
   - Set **Root Directory**: `shader-playground`
   - Add environment variables:
     ```
     NODE_ENV=production
     VITE_API_URL=https://your-backend-service.up.railway.app
     VITE_EMBEDDING_URL=https://your-embedding-service.up.railway.app
     ```

4. **Deploy Embedding Service:**
   - Click "Add Service" → "GitHub Repo" (same repo)
   - Set **Root Directory**: `embedding-service`
   - Set **Start Command**: `node server.js`
   - Add environment variables:
     ```
     NODE_ENV=production
     ```

#### Option B: Use Railway CLI (Advanced)

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and deploy:**
   ```bash
   railway login
   railway init
   railway up
   ```

### Step 3: Configure Service URLs

After deployment, Railway will provide URLs for each service:
- Frontend: `https://frontend-xxx.up.railway.app`
- Backend: `https://backend-xxx.up.railway.app`
- Embedding: `https://embedding-xxx.up.railway.app`

1. **Update Backend Environment:**
   ```
   FRONTEND_URL=https://frontend-xxx.up.railway.app
   EMBEDDING_SERVICE_URL=https://embedding-xxx.up.railway.app
   ```

2. **Update Frontend Environment:**
   ```
   VITE_API_URL=https://backend-xxx.up.railway.app
   VITE_EMBEDDING_URL=https://embedding-xxx.up.railway.app
   ```

### Step 4: Verify Deployment

1. **Check service health:**
   - Backend: `https://backend-xxx.up.railway.app/health`
   - Embedding: `https://embedding-xxx.up.railway.app/health`
   - Frontend: `https://frontend-xxx.up.railway.app`

2. **Test functionality:**
   - Visit frontend URL
   - Test microphone permissions
   - Test conversation features
   - Check browser console for errors

### Step 5: Share with Family & Friends

1. **Custom Domain (Optional):**
   - In Railway dashboard → Settings → Domains
   - Add your custom domain or use Railway subdomain

2. **Share the URL:**
   - Send frontend URL to testers
   - Include basic usage instructions
   - Set up feedback collection method

## 🔧 Troubleshooting

### Common Issues

1. **CORS Errors:**
   - Ensure frontend URL is added to backend CORS configuration
   - Check that all service URLs are correctly configured

2. **API Connection Issues:**
   - Verify OpenAI API key is correctly set
   - Check that backend can reach OpenAI API
   - Review Railway logs for connection errors

3. **Build Failures:**
   - Check Railway build logs
   - Ensure all dependencies are in package.json
   - Verify Dockerfile configurations

4. **Service Communication:**
   - Ensure all services are deployed and healthy
   - Check inter-service URL configurations
   - Verify environment variables are set correctly

### Monitoring & Logs

1. **Railway Dashboard:**
   - View deployment logs
   - Monitor resource usage
   - Check service health

2. **Application Logs:**
   - Backend logs include request details
   - Frontend console shows API responses
   - Check for CORS and connection errors

## 💰 Cost Estimation

**Railway.app Pricing:**
- Free tier: 512MB RAM, $5 credit monthly
- Starter: $5/month per service
- **Estimated total: $8-15/month** for 3 services

**Optimization Tips:**
- Use starter plan only for production services
- Keep development/staging on free tier
- Monitor resource usage to optimize costs

## 🔒 Security Considerations

1. **Environment Variables:**
   - Never commit API keys to repository
   - Use Railway's environment variable manager
   - Rotate API keys regularly

2. **CORS Configuration:**
   - Production CORS is configured for Railway domains
   - Review allowed origins regularly
   - Consider IP restrictions if needed

3. **Monitoring:**
   - Set up basic uptime monitoring
   - Review logs for security issues
   - Monitor API usage and costs

## 📞 Support

If you encounter issues:
1. Check Railway documentation
2. Review application logs
3. Test individual service endpoints
4. Verify environment variable configuration
5. Check this repository's GitHub issues