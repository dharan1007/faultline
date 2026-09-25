FROM node:22-bookworm

ENV NODE_ENV=production \
    CI=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /opt/faultline

COPY package.json package-lock.json ./

# Install the exact locked Node dependencies first, then install the system
# libraries and browser revisions belonging to Playwright 1.63.0.
RUN npm ci --ignore-scripts --omit=dev \
    && ./node_modules/.bin/playwright install --with-deps chromium firefox webkit \
    && npm cache clean --force \
    && chmod -R a+rX /ms-playwright

COPY . .

RUN node scripts-vendor.mjs \
    && node --check bin/faultline.mjs \
    && node --check integrations/playwright-capture/index.js \
    && node --check integrations/playwright-live/index.js \
    && node --check integrations/playwright-environment/index.js \
    && node --check integrations/playwright-trace/index.js \
    && node --check src/live-reducer.js \
    && node --check src/collection-reducer.js \
    && chown -R node:node /opt/faultline

USER node

ENTRYPOINT ["node","bin/faultline.mjs"]
CMD ["--help"]
