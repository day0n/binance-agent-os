resource "google_kms_crypto_key_iam_member" "decrypt" {
  crypto_key_id = google_kms_crypto_key.envelope.id
  role          = "roles/cloudkms.cryptoKeyDecrypter"
  member        = "serviceAccount:${google_service_account.executor.email}"
}

resource "google_kms_crypto_key_iam_member" "public" {
  crypto_key_id = google_kms_crypto_key.envelope.id
  role          = "roles/cloudkms.publicKeyViewer"
  member        = "serviceAccount:${google_service_account.wif.email}"
}

resource "google_project_iam_member" "executor_log" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.executor.email}"
}

resource "google_secret_manager_secret" "executor" {
  secret_id = "bao-executor-config"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "executor" {
  secret_id = google_secret_manager_secret.executor.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.executor.email}"
}
