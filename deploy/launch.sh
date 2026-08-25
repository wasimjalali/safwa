#!/usr/bin/env bash
set -euo pipefail

#
# Ṣafwa LLM Server - EC2 launch script
#
# Run this ON the EC2 instance after SSH-ing in. It:
#   1. Installs Docker + NVIDIA drivers (if not present)
#   2. Builds the vLLM Docker image with the chosen model
#   3. Starts the server on port 8000
#
# Usage:
#   ./launch.sh              # defaults to Ornith-1.5-9B
#   ./launch.sh 35b          # uses Ornith-1.5-35B-A3B
#   MODEL_ID=custom/model ./launch.sh  # override entirely

MODEL_ID="${MODEL_ID:-}"
SIZE_ARG="${1:-}"

if [ -z "$MODEL_ID" ]; then
  case "$SIZE_ARG" in
    35b) MODEL_ID="ornith-ai/Ornith-1.5-35B-A3B" ;;
    *)   MODEL_ID="ornith-ai/Ornith-1.5-9B" ;;
  esac
fi

IMAGE_TAG="safwa-llm"
if [ "$SIZE_ARG" = "35b" ]; then
  IMAGE_TAG="safwa-llm-35b"
fi

echo "=== Ṣafwa LLM Server ==="
echo "Model: $MODEL_ID"
echo "Image: $IMAGE_TAG"
echo ""

# ── 1. Ensure Docker is installed ────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  sudo dnf install -y docker
  sudo systemctl start docker
  sudo systemctl enable docker
  sudo usermod -aG docker "$(whoami)"
  echo "Docker installed. You may need to re-login for group changes."
fi

# ── 2. Ensure NVIDIA drivers + NVIDIA Container Toolkit ─────────────
if ! nvidia-smi &>/dev/null; then
  echo "Installing NVIDIA drivers..."
  # AWS g5 instances use the NVIDIA A10G. The AWS-optimized AL2023 AMI
  # includes drivers, but if you're on a plain AMI, install them:
  sudo dnf install -y kernel-devel-$(uname -r)
  sudo dnf install -y nvidia-driver
  sudo modprobe nvidia
fi

if ! docker info 2>/dev/null | grep -q Runtimes.*nvidia; then
  echo "Installing NVIDIA Container Toolkit..."
  sudo dnf install -y nvidia-container-toolkit
  sudo systemctl restart docker
fi

# ── 3. Create model cache directory on EBS ──────────────────────────
CACHE_DIR="/mnt/safwa-models"
if [ ! -d "$CACHE_DIR" ]; then
  echo "Creating model cache at $CACHE_DIR ..."
  sudo mkdir -p "$CACHE_DIR"
  sudo chown "$(whoami)" "$CACHE_DIR"
fi

# ── 4. Build the Docker image ───────────────────────────────────────
echo "Building Docker image (this downloads vLLM + base image, ~5 min first time)..."
cd "$(dirname "$0")"
docker build --build-arg MODEL_ID="$MODEL_ID" -t "$IMAGE_TAG" .

# ── 5. Stop any existing container ──────────────────────────────────
if docker ps -a --format '{{.Names}}' | grep -q safwa-llm-server; then
  echo "Stopping existing container..."
  docker rm -f safwa-llm-server
fi

# ── 6. Launch the server ────────────────────────────────────────────
echo "Starting vLLM server on port 8000..."
echo "The model will download on first launch (~5-15 min depending on size)."
echo "Wait for the log line 'Application startup complete' before using the API."
echo ""
echo "Health check: curl http://localhost:8000/v1/models"
echo ""

docker run -d \
  --name safwa-llm-server \
  --gpus all \
  -p 8000:8000 \
  -v "$CACHE_DIR:/models" \
  --restart unless-stopped \
  "$IMAGE_TAG"

echo ""
echo "Container started. Tailing logs (Ctrl+C to stop watching, server keeps running)..."
echo ""
docker logs -f safwa-llm-server
