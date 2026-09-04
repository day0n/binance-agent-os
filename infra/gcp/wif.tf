resource "google_iam_workload_identity_pool" "vercel" {
  workload_identity_pool_id = "bao-vercel"
  display_name              = "Binance Agent OS Vercel"
}

resource "google_iam_workload_identity_pool_provider" "vercel" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.vercel.workload_identity_pool_id
  workload_identity_pool_provider_id = "vercel"
  display_name                       = "Vercel OIDC"
  attribute_mapping = {
    "google.subject"     = "assertion.sub"
    "attribute.project"  = "assertion.project_id"
    "attribute.org"      = "assertion.org_id"
    "attribute.env"      = "assertion.environment"
  }
  oidc {
    issuer_uri = "https://oidc.vercel.com"
  }
  attribute_condition = "attribute.org == \"${var.vercel_org_id}\" && attribute.project == \"${var.vercel_project_id}\" && attribute.env in [${join(",", [for env in var.allowed_vercel_envs : format("%q", env)])}]"
}

resource "google_service_account" "wif" {
  account_id   = "bao-vercel-wif"
  display_name = "Vercel WIF caller"
}

resource "google_service_account_iam_member" "wif_user" {
  service_account_id = google_service_account.wif.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.vercel.name}/attribute.org/${var.vercel_org_id}"
}
