# Infrastructure as Code: creates RetailFlow on Render.com (free plan, no credit card).
#   - a free PostgreSQL database
#   - a free web service that builds app/Dockerfile from the GitHub repo
#
# Authentication comes from environment variables, never from this file:
#   export RENDER_API_KEY=...    (Render dashboard -> Account Settings -> API Keys)
#   export RENDER_OWNER_ID=...   (your workspace ID, starts with "tea-" or "usr-")

terraform {
  required_version = ">= 1.5"
  required_providers {
    render = { source = "render-oss/render", version = "~> 1.9" }
  }
}

provider "render" {
  # Deployments are triggered by the CI/CD pipeline after the tests pass, not by Terraform.
  skip_deploy_after_service_update = true
}

variable "region" {
  description = "Render region (singapore is closest to India)"
  type        = string
  default     = "singapore"
}

variable "repo_url" {
  description = "Public GitHub repository that Render builds from"
  type        = string
  default     = "https://github.com/SHIVAMCP18/retailflow-devops"
}

resource "render_postgres" "db" {
  name          = "retailflow-db"
  plan          = "free"
  region        = var.region
  version       = "16"
  database_name = "retailflow"
  database_user = "retailflow"
}

resource "render_web_service" "app" {
  name              = "retailflow"
  plan              = "free"
  region            = var.region
  health_check_path = "/health"

  runtime_source = {
    docker = {
      repo_url        = var.repo_url
      branch          = "main"
      context         = "./app"
      dockerfile_path = "./app/Dockerfile"
      auto_deploy     = false # the pipeline deploys only commits that passed all checks
    }
  }

  env_vars = {
    # Private network address of the database; the password never appears in Git
    DATABASE_URL = { value = render_postgres.db.connection_info.internal_connection_string }
  }
}

output "service_id" {
  description = "Put this in the RENDER_SERVICE_ID GitHub secret"
  value       = render_web_service.app.id
}

output "website" {
  description = "Public link to the store"
  value       = render_web_service.app.url
}
