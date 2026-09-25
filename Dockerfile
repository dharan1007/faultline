FROM mcr.microsoft.com/playwright:v1.63.0-noble

ENV NODE_ENV=production \
    CI=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /opt/faultline

COPY --chown=pwuser:pwuser package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev \
    && npm cache clean --force

COPY --chown=pwuser:pwuser . .

# Materialize the pinned parser asset and verify the installable CLI/package
# surface while still building as root. Runtime execution is non-root.
RUN node scripts-vendor.mjs \
    && node --check bin/faultline.mjs \
    && node --check integrations/playwright-capture/index.js \
    && node --check integrations/playwright-live/index.js \
    && node --check integrations/playwright-environment/index.js \
    && node --check integrations/playwright-trace/index.js \
    && node --check src/live-reducer.js \
    && node --check src/collection-reducer.js

USER pwuser

ENTRYPOINT ["node","bin/faultline.mjs"]
CMD ["--help"]
