# RetailFlow: DevOps project

A small online store (product list, add product, buy, recent orders), built and delivered with a
complete DevOps toolchain: **Docker, Kubernetes, Terraform, GitHub Actions CI/CD, DevSecOps
scanning and Google Cloud**, with a public HTTPS link.

```
                 ┌──────────────────────────── Google Cloud e2-micro VM (created by Terraform) ──┐
 Browser ─HTTPS─►│ Caddy (HTTPS, Let's Encrypt) ──► RetailFlow app (Node.js) ──► PostgreSQL        │
                 └───────────────────────────────────────────────────────────────────────────────┘
                                   ▲ docker compose pull / up
 git push ─► GitHub Actions: test ─► security scan ─► build + scan image ─► Kubernetes test ─► deploy
```

## How each requirement is met

| Requirement | Marks | Where |
|---|---|---|
| **Microservices** | 3 | The app is an independent, stateless service with its own database, a REST API (`/api/products`, `/api/orders`), a health endpoint and graceful shutdown. It runs as separate containers (app, database, proxy) that talk over the network, and it scales to several replicas on Kubernetes (`k8s/app.yaml`, 2 replicas). |
| **Docker** | 4 | `app/Dockerfile` (small Alpine image, non-root user, health check) and `docker-compose.yml` (app + PostgreSQL + Caddy, volumes, health checks). One command runs everything. |
| **IaC** | 2 | `terraform/`: one file creates the Google Cloud VM, firewall rules and SSH access. `startup.sh` installs Docker on first boot. `terraform apply` / `terraform destroy`. |
| **Kubernetes** | 2 | `k8s/`: Namespace, Deployment (2 replicas, probes, resource limits, non-root), StatefulSet with a persistent volume for PostgreSQL, Services, and the password stored as a Secret. Tested automatically on every push in a temporary `kind` cluster. |
| **CI/CD** | 3 | `.github/workflows/ci-cd.yml`: test → security scan → build and scan image → Kubernetes test → push to GitHub Container Registry → deploy to the VM and check the live site. |
| **DevSecOps** | 2 | In the pipeline: **Gitleaks** (secrets in Git), **Trivy** (vulnerable dependencies, image scan, misconfigurations), **Dependabot** (`.github/dependabot.yml`). Plus: non-root containers, read-only filesystem on Kubernetes, secrets never in Git (random password generated on the VM), HTTPS, security headers, input validation. |
| **Cloud** | 2 | Google Cloud, Always Free `e2-micro` VM in `us-central1`. |
| **Public link** | 2 | `https://retailflow.<VM-IP>.sslip.io`, a free hostname that points at the VM's IP. Caddy gets a real HTTPS certificate automatically. |

## Run it on your laptop (Docker)

Needs Docker Desktop.
```bash
cp .env.example .env
docker compose up --build
```
Open **http://localhost:8080**. Test it with `./scripts/smoke.sh`. Stop with `docker compose down`.

## Run it on Kubernetes (Docker Desktop)

1. Docker Desktop → Settings → **Kubernetes** → Enable Kubernetes → Apply.
2. Build the image, then deploy:
   ```bash
   docker build -t ghcr.io/shivamcp18/retailflow:latest app
   ./k8s/deploy.sh
   kubectl -n retailflow get pods
   ```
3. Open **http://localhost:8080**. Refresh a few times: the footer shows which of the 2 pods answered.

Remove it with `kubectl delete namespace retailflow`.

## Deploy to Google Cloud (one time, about 15 minutes)

**1. Tools on your Mac**
```bash
brew install --cask google-cloud-sdk
brew install terraform
gcloud auth login
gcloud auth application-default login
```

**2. A project.** In the Google Cloud console, create a project (for example `retailflow-devops`) and
link a billing account. The e2-micro VM is free, but Google needs billing switched on to create it.
Set a budget alert (Billing → Budgets) of a few dollars to be safe.

**3. A deploy key** (GitHub Actions uses it to log in to the VM):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/retailflow_deploy -N ""
```

**4. Create the server with Terraform**
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars     # put your project ID in it
terraform init
terraform apply                                  # type "yes"
```
It prints `server_ip` and `website`.

**5. GitHub secrets.** Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `VM_HOST` | the `server_ip` from Terraform |
| `VM_USER` | `deploy` |
| `VM_SSH_KEY` | the whole content of `~/.ssh/retailflow_deploy` (the private key) |

**6. Deploy.** Push to `main` (or Actions → CI/CD → Run workflow). The last job deploys and prints the
live link. The first HTTPS certificate can take a minute.

**7. Make the image public (optional).** GitHub → your profile → Packages → `retailflow` → Package
settings → Change visibility → Public. This lets anyone `docker pull` it. The VM can pull it
either way, because the pipeline logs in.

**When you're done:** `terraform destroy` deletes the VM and firewall rules.

## The pipeline, step by step

| Stage | What it does | Fails the build when |
|---|---|---|
| 1. Test | `npm ci && npm test` (unit tests in `app/test`) | a test fails |
| 2. Security scan | Gitleaks, Trivy dependency scan, Trivy config scan | a secret is committed, or a dependency has a CRITICAL vulnerability |
| 3. Build | `docker build`, Trivy image scan, push to `ghcr.io` (main only) | the image has a CRITICAL vulnerability |
| 4. Kubernetes test | creates a `kind` cluster, runs `k8s/deploy.sh`, runs `scripts/smoke.sh` against it | the app doesn't work on Kubernetes |
| 5. Deploy | copies `docker-compose.yml` to the VM, pulls the new image (tagged with the commit SHA), restarts, runs `smoke.sh` against the public URL | the live site doesn't answer |

The website footer shows the running version (the commit SHA), so you can prove that a new push was deployed.

## Project layout

```
app/                     the service: Node.js + Express API and the website (public/)
  src/server.js          API + database
  src/validation.js      input checks (unit-tested)
  test/                  unit tests
  Dockerfile
docker-compose.yml       app + PostgreSQL + Caddy
Caddyfile                reverse proxy + automatic HTTPS
k8s/                     Kubernetes manifests + deploy.sh
terraform/               Google Cloud VM, firewall, startup script
.github/workflows/       CI/CD pipeline
.github/dependabot.yml   automatic dependency updates
scripts/smoke.sh         end-to-end test used locally, in CI and after deployment
```

## Quick answers for the viva

- **Why Docker?** The app and all its dependencies run the same way on any machine: the laptop, CI and the cloud.
- **Docker Compose vs Kubernetes?** Compose runs the containers on one machine, which is enough for the free 1 GB VM. Kubernetes adds replicas, self-healing (liveness and readiness probes), rolling updates and Secrets, and is tested in CI.
- **What does Terraform give us?** The server is described in code: repeatable, reviewable, and removable with one command.
- **Where are the secrets?** Never in Git. The database password is generated randomly on the VM (`startup.sh`). On Kubernetes it's a Secret. GitHub keeps the SSH key as an encrypted secret.
- **What is DevSecOps here?** Security checks run automatically in every pipeline run (shift left): leaked secrets, vulnerable libraries, image vulnerabilities and misconfigurations block the release.
- **How does HTTPS work?** sslip.io turns the IP into a hostname. Caddy requests a free certificate from Let's Encrypt and renews it automatically.
