variable "project_id" {
  description = "Your Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Must be us-west1, us-central1 or us-east1 for the free tier"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  type    = string
  default = "us-central1-a"
}

variable "ssh_user" {
  description = "Linux user that GitHub Actions uses to deploy"
  type        = string
  default     = "deploy"
}

variable "ssh_public_key_file" {
  description = "Path to the public half of the deploy key"
  type        = string
  default     = "~/.ssh/retailflow_deploy.pub"
}

variable "ssh_source_ranges" {
  description = "Who may connect over SSH"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
