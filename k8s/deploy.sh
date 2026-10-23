#!/usr/bin/env bash
# Deploys RetailFlow to the current Kubernetes cluster (e.g. Docker Desktop -> Settings -> Kubernetes -> Enable).
set -euo pipefail
cd "$(dirname "$0")/.."
kubectl apply -f k8s/namespace.yaml
# The database password is stored as a Kubernetes Secret, never in the YAML files
kubectl -n retailflow create secret generic retailflow-secret \
  --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-change-me-postgres}" --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/database.yaml -f k8s/app.yaml
kubectl -n retailflow rollout status statefulset/db --timeout=3m
kubectl -n retailflow rollout status deployment/app --timeout=3m
kubectl -n retailflow get pods
echo "Open http://localhost:8080 (Docker Desktop)  or run: kubectl -n retailflow port-forward svc/app 8080:8080"
