# Creates the RetailFlow server on Google Cloud (Always Free tier):
#   - one e2-micro VM (Debian 12) with a 30 GB standard disk
#   - firewall rules for SSH (22) and the website (80, 443)
# On first boot, startup.sh installs Docker and prepares the app folder.

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# The Compute Engine API must be switched on before a VM can be created.
resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_compute_firewall" "web" {
  name          = "retailflow-allow-web"
  network       = "default"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["retailflow"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
  depends_on = [google_project_service.compute]
}

resource "google_compute_firewall" "ssh" {
  name          = "retailflow-allow-ssh"
  network       = "default"
  source_ranges = var.ssh_source_ranges # GitHub Actions deploys over SSH, so this is open by default; login is key-only
  target_tags   = ["retailflow"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  depends_on = [google_project_service.compute]
}

resource "google_compute_instance" "server" {
  name         = "retailflow"
  machine_type = "e2-micro" # Always Free in us-west1, us-central1 and us-east1
  tags         = ["retailflow"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 30            # GB, the free-tier limit
      type  = "pd-standard" # standard disk is the free one
    }
  }

  network_interface {
    network = "default"
    access_config {} # gives the VM a public IP address
  }

  metadata = {
    # The deploy user and its public key. The private key goes into GitHub Secrets.
    ssh-keys = "${var.ssh_user}:${file(var.ssh_public_key_file)}"
  }
  metadata_startup_script = file("${path.module}/startup.sh")

  depends_on = [google_project_service.compute]
}
