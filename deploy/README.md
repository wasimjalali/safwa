# Ṣafwa LLM Server - AWS EC2 Setup Guide

Step-by-step instructions for launching the self-hosted LLM server on AWS.
This runs Ornith-1.5 (9B or 35B) on a g5.xlarge instance with an A10G GPU (24GB VRAM).

**Cost:** ~$17.50/month at 4 hours/week, paid from your AWS credits.
**Data sovereignty:** All comment text stays on your server. Nothing is sent to any third party.

---

## AWS Resources (already created via CLI)

These resources are already provisioned in `us-east-1`. You don't need to create them again.

| Resource | ID | Notes |
|---|---|---|
| Security group | `sg-0e3a8731d3dc913ba` | safwa-llm-sg, ports 22 + 8000 from your IP |
| EBS volume | `vol-0992e08921cdff94c` | safwa-model-cache, 50GB gp3, us-east-1a |
| AMI | `ami-0eb4d8bc9eb48d8ae` | Deep Learning GPU PyTorch 2.12, AL2023 |
| Key pair | `wasimwepapp` | for SSH access |
| Subnet | `subnet-04a12d826d4ae1868` | us-east-1a |
| VPC | `vpc-054f4b0bf46423587` | default VPC |

## GPU Quota

A quota increase request for 4 vCPUs of "Running On-Demand G and VT instances" has been submitted (status: CASE_OPENED). A cron monitor checks every 15 minutes and will alert you when it's approved. You cannot launch the g5.xlarge until this is approved.

---

## Launch the EC2 Instance (after quota is approved)

Hermes can do this via CLI in one command. Or via the AWS console:

1. Go to **AWS Console** > **EC2** > **Instances** > **Launch instances**
2. **Name:** `safwa-llm`
3. **AMI:** `ami-0eb4d8bc9eb48d8ae` (Deep Learning GPU PyTorch 2.12, AL2023)
4. **Instance type:** `g5.xlarge`
5. **Key pair:** `wasimwepapp`
6. **Network:** VPC `vpc-054f4b0bf46423587`, Subnet `subnet-04a12d826d4ae1868` (us-east-1a)
7. **Security group:** `sg-0e3a8731d3dc913ba` (safwa-llm-sg)
8. **Storage:**
   - Root volume: 30 GB gp3
   - Click **Add new volume**: 50 GB gp3, uncheck Delete on termination
9. Click **Launch instance**

---

## Phase 4: Attach and Mount the EBS Volume

If you created the EBS volume separately in Phase 2 (not as part of the launch):

1. Go to **EC2** > **Volumes**
2. Select `safwa-model-cache`
3. Actions > **Attach volume**
4. Select your `safwa-llm` instance
5. Device name: `/dev/sdf`
6. Click **Attach**

Now SSH into the instance and mount it:

```bash
ssh -i your-key.pem ec2-user@<instance-public-ip>

# Format the volume (only the FIRST time)
sudo mkfs -t xfs /dev/sdf

# Create mount point and mount
sudo mkdir -p /mnt/safwa-models
sudo mount /dev/sdf /mnt/safwa-models

# Persist across reboots
echo '/dev/sdf /mnt/safwa-models xfs defaults,nofail 0 2' | sudo tee -a /etc/fstab

# Set ownership
sudo chown ec2-user:ec2-user /mnt/safwa-models
```

---

## Phase 5: Deploy the LLM Server

Still SSH'd into the instance:

```bash
# Get the deployment scripts onto the instance
# Option A: Clone the repo (if it's on GitHub)
git clone <your-repo-url> /tmp/safwa
cd /tmp/safwa/deploy

# Option B: Copy files from your local machine (from your Mac)
# On your Mac:
#   scp -i your-key.pem -r deploy/ ec2-user@<instance-ip>:/tmp/safwa-deploy/
# On the EC2 instance:
#   cd /tmp/safwa-deploy

# Make scripts executable
chmod +x launch.sh teardown.sh health-check.sh

# Launch with the 9B model (faster to download, good for first test)
./launch.sh

# OR launch with the 35B MoE (better quality, larger download)
# ./launch.sh 35b
```

The first launch downloads the model weights:
- 9B: ~19 GB download (~5-10 min on AWS network)
- 35B-A3B: ~70 GB download (~15-30 min on AWS network)

Wait for the log line:
```
INFO:     Application startup complete.
```

Then run the health check:
```bash
./health-check.sh
```

If you see a JSON response with `"classification": "duplicate"`, the server is working.

---

## Phase 6: Connect the Chrome Extension

1. Get the instance's **Public IP** from the EC2 console
2. Open `src/config.js` in the Ṣafwa extension on your Mac
3. Change the LLM endpoint:
   ```js
   LLM_ENDPOINT: "http://<EC2-PUBLIC-IP>:8000/v1/chat/completions",
   LLM_MODEL: "Ornith-1.5-9B",  // or "Ornith-1.5-35B-A3B"
   ```
4. Reload the extension in `chrome://extensions`
5. Open StreamYard and check the console for `[Ṣafwa]` lines

The extension will now send ambiguous comments to your self-hosted LLM for semantic classification.

---

## Phase 7: Teardown (after the stream)

```bash
# SSH into the instance
ssh -i your-key.pem ec2-user@<instance-ip>

# Stop the container
cd /tmp/safwa/deploy  # or wherever you put the scripts
./teardown.sh

# Stop the EC2 instance to halt GPU billing
./teardown.sh --stop-vm
```

Or from the AWS console: **EC2** > **Instances** > select `safwa-llm` > **Instance state** > **Stop instance**

The EBS volumes (root + model cache) persist and cost ~$7/month total. The GPU billing stops completely.

---

## Quick Start Summary (after first-time setup)

Once the EBS volume exists and you've done the first launch:

### Before each stream (5 min)
1. AWS Console > EC2 > Start the `safwa-llm` instance
2. SSH in: `ssh -i your-key.pem ec2-user@<new-public-ip>`
3. Mount the volume: `sudo mount /dev/sdf /mnt/safwa-models`
4. Start the server: `docker start safwa-llm-server`
5. Wait for "Application startup complete" in `docker logs -f safwa-llm-server`
6. Update `LLM_ENDPOINT` in `src/config.js` with the new public IP (if it changed)
7. Reload the extension

### After each stream (2 min)
1. `docker stop safwa-llm-server`
2. AWS Console > EC2 > Stop the instance

### Cost per session
- 4 hours x $1.006/hr = ~$4.02 per stream
- ~$5/mo for the persistent EBS volume (model cache + root)
- Total: ~$21/month for weekly streaming, paid from AWS credits

---

## Switching Between 9B and 35B

To test both models:

1. Stop the current container: `docker stop safwa-llm-server`
2. Launch the other model:
   ```bash
   # If you were running 9B and want 35B:
   ./launch.sh 35b
   # If you were running 35B and want 9B:
   ./launch.sh
   ```
3. Update `LLM_MODEL` in `src/config.js` to match
4. Reload the extension

Both models fit on the g5.xlarge (24GB VRAM). The 35B at Q4 uses ~18GB, the 9B uses ~6GB.
The model weights for both are cached on the EBS volume after first download, so switching is fast.

---

## Troubleshooting

**"docker: Error response from daemon: could not select device driver"**
NVIDIA Container Toolkit not installed. The Deep Learning AMI should have it, but if not:
```bash
sudo dnf install -y nvidia-container-toolkit
sudo systemctl restart docker
```

**"CUDA out of memory"**
The 35B MoE needs ~18GB at Q4. If you're running other GPU processes, stop them:
```bash
nvidia-smi  # see what's using the GPU
```

**Model download is slow**
AWS transfers from HuggingFace are usually fast (500+ MB/s). If it's slow, try:
```bash
export HF_HUB_ENABLE_HF_TRANSFER=1
```

**Chrome extension can't reach the server**
Check the security group allows inbound TCP on port 8000 from your IP. The extension makes a plain HTTP request (no HTTPS needed for a private server, but Chrome may warn about mixed content if StreamYard is HTTPS). If Chrome blocks it, you'll need to either:
- Use HTTPS with a self-signed cert (more complex), or
- Route through a Cloudflare Tunnel (free, gives you HTTPS automatically)
