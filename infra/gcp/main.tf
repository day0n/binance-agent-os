terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_artifact_registry_repository" "executor" {
  location      = var.region
  repository_id = "binance-executor"
  description   = "Binance Agent OS executor images"
  format        = "DOCKER"
}
