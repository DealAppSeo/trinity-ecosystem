FROM ghcr.io/berriai/litellm:main-latest
ARG LITELLM_CONFIG_YAML
RUN echo "${LITELLM_CONFIG_YAML}" > /app/config.yaml
EXPOSE 4000
CMD ["litellm", "--config", "/app/config.yaml", \
"--port", "4000", "--num_workers", "4"]
