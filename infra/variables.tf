variable "project_id" {
  description = "ID do projeto GCP onde a VM é provisionada."
  type        = string
}

variable "region" {
  description = "Região GCP (ex.: southamerica-east1)."
  type        = string
}

variable "zone" {
  description = "Zona GCP (ex.: southamerica-east1-a)."
  type        = string
}

variable "machine_type" {
  description = "Tipo de máquina da VM única do gerador-de-itens."
  type        = string
  default     = "e2-small"
}

variable "boot_disk_image" {
  description = "Imagem de boot — Debian 12, base padrão do cloud-init deste módulo."
  type        = string
  default     = "debian-cloud/debian-12"
}

variable "data_disk_size_gb" {
  description = "Tamanho do disco de dados separado, onde o volume do Postgres vive (sobrevive a recriação da VM)."
  type        = number
  default     = 20
}

variable "ssh_user" {
  description = "Usuário SSH criado na VM (também dono de /opt/gerador, destino dos arquivos de deploy)."
  type        = string
}

variable "ssh_pub_key_path" {
  description = "Caminho local da chave pública SSH autorizada a entrar na VM."
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR liberado pra porta 22 — nunca 0.0.0.0/0. Use o IP de quem administra ou a faixa do runner de deploy."
  type        = string

  validation {
    condition     = var.allowed_ssh_cidr != "0.0.0.0/0"
    error_message = "allowed_ssh_cidr não pode ser 0.0.0.0/0 — restrinja ao IP de quem precisa entrar via SSH."
  }
}
