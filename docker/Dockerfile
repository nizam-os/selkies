# syntax=docker/dockerfile:1

# Chromium on Selkies with the nizam dashboard and its login gate.
# Build from the repository root: docker build -f docker/Dockerfile .
#
# SELKIES_RELEASE is the upstream tag this branch sits on. The dashboard ships
# its own copy of the streaming core, so BASE_IMAGE must run that same Selkies
# server; the build stops when it does not. Bump both together, right after
# rebasing the branch onto the new tag. The base comes straight from ghcr.io,
# where lscr.io redirects: lscr.io answers GitHub's shared runners with 429.
#
# The UI stage builds on the build host's own platform whatever the target:
# its output is static files, so an arm64 image never emulates the npm build.
ARG SELKIES_RELEASE=2.0.0
ARG BASE_IMAGE=ghcr.io/linuxserver/chromium:latest@sha256:f2d4b8b284918d8d65e10921e2fc84c57fd7edbc15345ddb3c024f0949f0031c

FROM --platform=$BUILDPLATFORM node:22-alpine AS ui
WORKDIR /src/addons
COPY addons/selkies-web-core selkies-web-core
COPY addons/selkies-dashboard/src selkies-dashboard/src
COPY addons/universal-touch-gamepad universal-touch-gamepad
COPY addons/nizam-dashboard nizam-dashboard
RUN cd selkies-web-core && npm ci --no-audit --no-fund && npm run build \
 && cd ../nizam-dashboard && npm ci --no-audit --no-fund && npm run build

FROM ${BASE_IMAGE}
ARG SELKIES_RELEASE
RUN installed="$(/lsiopy/bin/pip show selkies | awk '/^Version:/{print $2}')" && \
    if [ "${installed}" != "${SELKIES_RELEASE}" ]; then \
      echo "The base image runs Selkies ${installed}; this branch is ${SELKIES_RELEASE}." >&2; \
      exit 1; \
    fi
COPY --from=ui /src/addons/nizam-dashboard/dist /usr/share/selkies/nizam-dashboard
COPY docker/root/ /
# The session token reaches Selkies only from the gate's cookie, through nginx
# (gate.py), and WebRTC signaling wants it in a message the page itself sends,
# so the stream stays on WebSockets.
ENV DASHBOARD=nizam-dashboard \
    SELKIES_ENABLE_DUAL_MODE=false
