# Inputs to the stack. Defaults are tuned for `dev`; staging and prod
# override via `-var-file=staging.tfvars` (one .tfvars per environment).

variable "project_name" {
  description = "Resource name prefix used everywhere — keeps dev/staging/prod stacks isolated under one AWS account."
  type        = string
  default     = "gallo-sanitization"
}

variable "environment" {
  description = "Environment slug (dev | staging | prod). Appended to every resource name."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "Region every resource lives in. Single-region for MVP."
  type        = string
  default     = "us-west-2"
}

variable "frontend_origin" {
  description = "Allowed CORS origin for the API. The Express CORS middleware reads this from the FRONTEND_ORIGIN env var."
  type        = string
  default     = "https://app.gallo-sanitization.com"
}

variable "jwt_secret" {
  description = "JWT signing secret. MUST be set via TF_VAR_jwt_secret in CI; the empty default is a guard rail that fails the apply."
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters. Set TF_VAR_jwt_secret in your environment."
  }
}

variable "lambda_api_provisioned_concurrency" {
  description = "Number of always-warm containers for the API Lambda. 0 disables provisioned concurrency (fine for dev). 2 is the recommended floor for production business hours."
  type        = number
  default     = 0
}

# ─── Computed ────────────────────────────────────────────────────────
# Helper local that every resource name uses, so renaming the project
# or environment doesn't require sed across every .tf file.

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
