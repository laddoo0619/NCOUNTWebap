# Stage 1: Build client and server
FROM node:20-alpine AS build

WORKDIR /app

# Install server dependencies
COPY server/package.json server/
RUN cd server && npm install

# Install client dependencies
COPY client/package.json client/
RUN cd client && npm install

# Copy source and build
COPY server/ server/
COPY client/ client/

RUN cd client && npm run build
RUN cd server && npm run build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Copy compiled server and its dependencies
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/package.json server/

# Copy built client static files
COPY --from=build /app/client/dist client/dist

# Create uploads directory
RUN mkdir -p server/uploads

ENV NODE_ENV=production

EXPOSE 8080

WORKDIR /app/server

CMD ["node", "dist/index.js"]
