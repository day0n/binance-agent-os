resource "google_compute_network" "executor" {
  name                    = "bao-executor"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "executor" {
  name          = "bao-executor"
  ip_cidr_range = "10.20.0.0/24"
  region        = var.region
  network       = google_compute_network.executor.id
}

resource "google_compute_router" "executor" {
  name    = "bao-executor"
  region  = var.region
  network = google_compute_network.executor.id
}

resource "google_compute_address" "nat" {
  name   = "bao-executor-nat"
  region = var.region
}

resource "google_compute_router_nat" "executor" {
  name                               = "bao-executor-nat"
  router                             = google_compute_router.executor.name
  region                             = var.region
  nat_ip_allocate_option             = "MANUAL_ONLY"
  nat_ips                            = [google_compute_address.nat.self_link]
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}
