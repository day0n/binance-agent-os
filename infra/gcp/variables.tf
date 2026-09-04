variable "project_id" {
  type        = string
  description = "User-owned GCP project for the executor. Do not use the OpenCreator Gemini project."
}

variable "region" {
  type    = string
  default = "asia-east1"
}

variable "vercel_org_id" {
  type        = string
  description = "Personal Vercel team/org id for WIF."
}

variable "vercel_project_id" {
  type        = string
  description = "Must be the binance-agent-os project id."
}

variable "vercel_project_name" {
  type    = string
  default = "binance-agent-os"
}

variable "allowed_vercel_envs" {
  type    = list(string)
  default = ["production", "preview"]
}
