FROM nginx:alpine
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.source="https://github.com/thebarbakov/chgk" \
      org.opencontainers.image.revision=$SOURCE_COMMIT
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
