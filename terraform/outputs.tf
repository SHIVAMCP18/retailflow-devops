output "server_ip" {
  description = "Public IP of the VM (put this in the VM_HOST GitHub secret)"
  value       = google_compute_instance.server.network_interface[0].access_config[0].nat_ip
}

output "website" {
  description = "Public link to the store (works after the first deployment)"
  value       = "https://retailflow.${google_compute_instance.server.network_interface[0].access_config[0].nat_ip}.sslip.io"
}
