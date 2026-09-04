output "executor_uri" {
  value = google_cloud_run_v2_service.executor.uri
}

output "nat_ip" {
  value = google_compute_address.nat.address
}

output "kms_key_resource" {
  value = google_kms_crypto_key.envelope.id
}

output "executor_service_account" {
  value = google_service_account.executor.email
}

output "wif_provider" {
  value = google_iam_workload_identity_pool_provider.vercel.name
}
