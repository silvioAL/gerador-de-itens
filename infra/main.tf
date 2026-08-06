# Fase D (SPEC-15) — módulo Terraform pequeno, pensado pra trocar de provedor
# trocando só este diretório: uma VM, um IP fixo, um disco de dados separado,
# firewall mínimo. Nada de Kubernetes/multi-serviço — ver SPEC-15 §6.

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# IP externo fixo — sem isso, recriar a VM troca o IP e quebra DNS/OIDC_REDIRECT_URI.
resource "google_compute_address" "gerador" {
  name   = "gerador-ip"
  region = var.region
}

# Disco de dados separado do disco de boot — o volume do Postgres vive aqui
# (montado em /mnt/pgdata pelo cloud-init), sobrevive a uma recriação de instância.
resource "google_compute_disk" "pgdata" {
  name = "gerador-pgdata"
  zone = var.zone
  size = var.data_disk_size_gb
  type = "pd-standard"
}

# Só 22 (SSH, restrito a allowed_ssh_cidr)/80/443 (HTTP/HTTPS via Caddy) —
# nada mais exposto. Aplica-se só a instâncias com a tag "gerador".
resource "google_compute_firewall" "gerador" {
  name    = "gerador-allow-web-ssh"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  source_ranges = [var.allowed_ssh_cidr]
  target_tags   = ["gerador"]
}

resource "google_compute_firewall" "gerador_web" {
  name    = "gerador-allow-http-https"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["gerador"]
}

resource "google_compute_instance" "gerador" {
  name         = "gerador-de-itens"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["gerador"]

  boot_disk {
    initialize_params {
      image = var.boot_disk_image
    }
  }

  attached_disk {
    source      = google_compute_disk.pgdata.id
    device_name = "pgdata"
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.gerador.address
    }
  }

  metadata = {
    ssh-keys  = "${var.ssh_user}:${file(var.ssh_pub_key_path)}"
    user-data = templatefile("${path.module}/cloud-init.yaml", { ssh_user = var.ssh_user })
  }
}
