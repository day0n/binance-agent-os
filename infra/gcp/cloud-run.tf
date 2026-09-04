resource "google_service_account" "executor" {
  account_id   = "bao-binance-executor"
  display_name = "Binance Agent OS executor"
}

resource "google_cloud_run_v2_service" "executor" {
  name     = "binance-executor"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.executor.email
    vpc_access {
      egress = "ALL_TRAFFIC"
      network_interfaces {
        network    = google_compute_network.executor.id
        subnetwork = google_compute_subnetwork.executor.id
      }
    }
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.executor.repository_id}/binance-executor:latest"
      ports {
        container_port = 8080
      }
      env {
        name  = "EXECUTOR_AUDIENCE"
        value = "https://binance-executor-${var.project_id}.${var.region}.run.app"
      }
      env {
        name  = "KMS_KEY_RESOURCE"
        value = google_kms_crypto_key.envelope.id
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_service_iam_member" "invoker" {
  name     = google_cloud_run_v2_service.executor.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.wif.email}"
}
