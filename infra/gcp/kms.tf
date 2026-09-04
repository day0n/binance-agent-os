resource "google_kms_key_ring" "executor" {
  name     = "bao-executor"
  location = var.region
}

resource "google_kms_crypto_key" "envelope" {
  name     = "bao-binance-envelope"
  key_ring = google_kms_key_ring.executor.id
  purpose  = "ASYMMETRIC_DECRYPT"
  version_template {
    algorithm = "RSA_DECRYPT_OAEP_3072_SHA256"
  }
}
