# ─── NexaPay — Hugging Face Docker Space ───
# Single-validator deployment for sandbox/demo use.
# Chain data persists in /data (HF persistent storage).
# PostgreSQL is hosted on Neon (serverless).

FROM rust:1.95 AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    clang \
    pkg-config \
    perl \
    git \
  && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.toml
COPY src src
COPY assets assets

RUN cargo build --release

# Runtime
FROM ubuntu:24.04
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/nexapay-node /usr/local/bin/nexapay-node

# HF Spaces convention — use /data for persistence
RUN mkdir -p /data/chain_data /data/chain_state

EXPOSE 7860

# Single validator mode — no BFT consensus needed
ENV NEXAPAY_VALIDATOR_COUNT=1
ENV NEXAPAY_VALIDATOR_INDEX=0
ENV NEXAPAY_PORT=7860
ENV NEXAPAY_STATE_DIR=/data/chain_state
ENV NEXAPAY_CHAIN_DATA_DIR=/data/chain_data
ENV APP_ENV=sandbox

CMD ["nexapay-node"]
