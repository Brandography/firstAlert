FROM node:20-alpine
WORKDIR /app

# 1) Manifest → install deps (caches nicely)
COPY package*.json ./
RUN npm ci

# 2) Build-time args
ARG SHOPIFY_STORE=first-alert.myshopify.com
ARG SFTP_HOST=sftp.igxfer.com
ARG SFTP_PORT=22
ARG SFTP_USER=BRNDGR1I1
ARG SFTP_REMOTE_PATH=/orders.csv


# 3) Expose to runtime
ENV SHOPIFY_STORE=${SHOPIFY_STORE} \
    SHOPIFY_ACCESS_TOKEN=${SHOPIFY_ACCESS_TOKEN} \
    SFTP_HOST=${SFTP_HOST} \
    SFTP_PORT=${SFTP_PORT} \
    SFTP_USER=${SFTP_USER} \
    SFTP_PASSWORD=${SFTP_PASSWORD} \
    SFTP_REMOTE_PATH=${SFTP_REMOTE_PATH}

# 4) Copy app code
COPY . .

# 5) If this is a web service:
# EXPOSE 8080
# CMD ["npm", "start"]

# 5b) If this is a batch job instead:
EXPOSE 8080
CMD ["node", "index.js"]