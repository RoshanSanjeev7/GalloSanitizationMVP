# Terraform + provider version constraints. Pin major versions only;
# minor / patch updates are usually safe and we want CVE fixes without
# a Terraform upgrade gate. The aws provider is pinned to v5.x because
# that's where the modern resource definitions live (older versions
# lack `aws_lambda_event_source_mapping` arguments we use).

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}
