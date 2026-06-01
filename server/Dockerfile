# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY *.go ./

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o synapse-server .

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates wget

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/synapse-server /app/synapse-server

# Create data directory
RUN mkdir -p /data

# Expose default port
EXPOSE 7070

ENTRYPOINT ["/app/synapse-server"]
