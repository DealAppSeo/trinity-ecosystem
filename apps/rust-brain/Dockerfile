# apps/rust-brain/Dockerfile
FROM rust:1.85 as builder
WORKDIR /usr/src/app
COPY . .
RUN cargo install --path .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/cargo/bin/rust-brain /usr/local/bin/rust-brain
ENV PORT=8080
EXPOSE 8080
CMD ["rust-brain"]
