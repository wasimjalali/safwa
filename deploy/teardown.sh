#!/usr/bin/env bash
set -euo pipefail

#
# Ṣafwa LLM Server - teardown script
#
# Stops the vLLM container and optionally stops the EC2 instance to halt
# GPU billing. Run this after your live stream ends.
#
# Usage:
#   ./teardown.sh              # stop container only (instance keeps running)
#   ./teardown.sh --stop-vm    # stop container + stop the EC2 instance
#   ./teardown.sh --destroy    # stop container + terminate the EC2 instance
#                               (WARNING: destroys the EBS volume too unless
#                                you set DeleteOnTermination=false)

MODE="${1:-}"

echo "=== Ṣafwa LLM Server - Teardown ==="

# Stop the container
if docker ps -a --format '{{.Names}}' | grep -q safwa-llm-server; then
  echo "Stopping container..."
  docker stop safwa-llm-server
  docker rm safwa-llm-server
  echo "Container stopped and removed."
else
  echo "No container found."
fi

if [ "$MODE" = "--stop-vm" ]; then
  echo ""
  echo "Stopping EC2 instance to halt GPU billing..."
  echo "The EBS volume (with model weights) persists and costs ~$5/mo."
  echo ""
  # Get this instance's ID from the metadata service
  INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "")
  if [ -n "$INSTANCE_ID" ]; then
    REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || echo "")
    echo "Instance: $INSTANCE_ID in $REGION"
    echo "Run this from your local machine to stop it:"
    echo "  aws ec2 stop-instances --instance-ids $INSTANCE_ID --region $REGION"
    echo ""
    echo "Or stop it from the AWS console: EC2 > Instances > select > Stop"
  else
    echo "Could not determine instance ID. Stop the instance from the AWS console."
  fi
elif [ "$MODE" = "--destroy" ]; then
  echo ""
  echo "WARNING: This will TERMINATE the EC2 instance."
  echo "The EBS volume may also be destroyed depending on its termination policy."
  echo "Press Ctrl+C to abort, or Enter to continue..."
  read -r
  INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "")
  if [ -n "$INSTANCE_ID" ]; then
    REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || echo "")
    echo "Run this from your local machine to terminate:"
    echo "  aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region $REGION"
  else
    echo "Could not determine instance ID. Terminate from the AWS console."
  fi
else
  echo ""
  echo "Container stopped. Instance is still running."
  echo "To stop GPU billing, either:"
  echo "  1. Run: ./teardown.sh --stop-vm"
  echo "  2. Or stop the instance from the AWS console: EC2 > Instances > Stop"
fi
