FROM debian:bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    openssh-client \
    git \
    ca-certificates \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Kart
RUN wget -q https://github.com/koordinates/kart/releases/download/v0.17.0/kart_0.17.0-1_amd64.deb \
    && dpkg -i kart_0.17.0-1_amd64.deb \
    && rm kart_0.17.0-1_amd64.deb

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/
COPY repos.yaml ./

# Run the sync service
CMD ["node", "dist/index.js"]
