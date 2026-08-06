output "instance_ip" {
  description = "IP externo fixo da VM — aponte o DNS do domínio pra cá, e use como GCP_VM_HOST no GitHub Actions (ver SPEC-15 §4)."
  value       = google_compute_address.gerador.address
}
