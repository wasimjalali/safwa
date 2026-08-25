# Ṣafwa LLM Server - Deployment for AWS EC2 g5.xlarge
#
# This Dockerfile builds a self-contained vLLM server image that loads
# Ornith-1.5 (9B or 35B-A3B) and serves an OpenAI-compatible API on port 8000.
#
# Build:
#   docker build --build-arg MODEL_ID=ornith-ai/Ornith-1.5-9B -t safwa-llm .
#   # or for the 35B MoE:
#   docker build --build-arg MODEL_ID=ornith-ai/Ornith-1.5-35B-A3B -t safwa-llm-35b .
#
# Run:
#   docker run --gpus all -p 8000:8000 -v /mnt/safwa-models:/models safwa-llm
#
# The model weights are cached on a persistent EBS volume at /mnt/safwa-models
# so you don't re-download on every start.

FROM vllm/vllm-openai:latest

ARG MODEL_ID=ornith-ai/Ornith-1.5-9B

ENV MODEL_ID=${MODEL_ID}
ENV HF_HOME=/models/huggingface
ENV VLLM_CACHE_ROOT=/models/vllm

# Pre-download is optional; vLLM downloads on first launch if not cached.
# We set the env vars so the cache lands on the mounted volume.

EXPOSE 8000

# Launch vLLM with settings tuned for the Ṣafwa use case:
#   --max-model-len 8192     we only send short comment text, no long context
#   --gpu-memory-utilization 0.90  leave headroom for the OS
#   --temperature 0.0        deterministic for classification
#   --enable-prefix-caching  the system prompt is identical every call
#   --trust-remote-code      Ornith needs this (Qwen base architecture)
CMD ["sh", "-c", "vllm serve ${MODEL_ID} --served-model-name ${MODEL_ID} --host 0.0.0.0 --port 8000 --max-model-len 8192 --gpu-memory-utilization 0.90 --enable-prefix-caching --trust-remote-code --dtype auto"]
