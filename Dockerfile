FROM node:20-alpine

# Build-time args (must include ALL variables you want to pass in)
ARG SHOPIFY_STORE=qa.shopify.firstalert.com
ARG _SHOPIFY_ACCESS_TOKEN
ARG SFTP_HOST=sftp.igxfer.com
ARG SFTP_PORT=22
ARG SFTP_USER=BRNDGR1I1
ARG _SFTP_PASSWORD
ARG SFTP_REMOTE_PATH=/orders.csv

# Export into the image’s runtime environment
ENV SHOPIFY_STORE=${SHOPIFY_STORE} \
    SHOPIFY_ACCESS_TOKEN=${_SHOPIFY_ACCESS_TOKEN} \
    SFTP_HOST=${SFTP_HOST} \
    SFTP_PORT=${SFTP_PORT} \
    SFTP_USER=${SFTP_USER} \
    SFTP_PASSWORD=${_SFTP_PASSWORD} \
    SFTP_REMOTE_PATH=${SFTP_REMOTE_PATH}

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD ["npm", "start"]