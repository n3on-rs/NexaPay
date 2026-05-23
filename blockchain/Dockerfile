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

# Match glibc with rust:1.95 builder (bookworm runtime was too old: GLIBC_2.39).
FROM ubuntu:24.04
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/nexapay-node /usr/local/bin/nexapay-node

RUN mkdir -p /app/chain_data /app/chain_state
# USER nexapay  # <-- set via docker-compose security_opt or K8s securityContext in prod
WORKDIR /app

EXPOSE 8080
CMD ["nexapay-node"]
