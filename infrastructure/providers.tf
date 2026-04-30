# AWS provider config. Region comes from the variable; profile comes
# from the AWS_PROFILE env var so CI can use IAM-role-from-OIDC and
# local development can use a named profile.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}
