# DEPLOYMENT INSTRUCTIONS

## 1. Local Production Deployment (Current Mode)
The application is pre-configured and running locally on Node.js using SQLite:
```bash
npm run build
npm start
```
The server listens on `http://localhost:3000` with zero cloud fees.

---

## 2. Docker Container Deployment

Create a `Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
COPY --from=builder /app/lib ./lib
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t career-app .
docker run -p 3000:3000 -v $(pwd)/data:/app/data career-app
```

---

## 3. Cloud Deployment (VPS / Railway / AWS Lightsail)

1. Provision an Ubuntu / Debian VPS with 1 GB+ RAM.
2. Install Node.js 20+ and PM2:
   ```bash
   npm install -g pm2
   ```
3. Copy the repository, run `npm install` and `npm run build`.
4. Start with PM2:
   ```bash
   pm2 start npm --name "career-app" -- start
   pm2 startup
   pm2 save
   ```
5. Configure Nginx with SSL (Certbot) reverse proxying to `http://localhost:3000`.
