import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export interface CertificateStackProps extends cdk.StackProps {
  /** Apex domain, e.g. "apricotcrab.com". */
  readonly domainName: string;
}

/**
 * A single ACM certificate covering the apex domain and a wildcard for every
 * subdomain. DNS validation is used, but no Route 53 hosted zone is provided:
 * CloudFlare is the authoritative nameserver, so the validation CNAME(s) are
 * added there by hand.
 *
 * Because the certificate is DNS-validated against an external DNS provider,
 * the FIRST deployment of this stack will PAUSE at "CREATE_IN_PROGRESS" on the
 * certificate resource until the CNAME(s) exist in CloudFlare and ACM observes
 * them. Grab the record name/value from the ACM console (us-east-1) while it is
 * pending. See the README for the full walk-through.
 */
export class CertificateStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const { domainName } = props;

    const certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName,
      subjectAlternativeNames: [`*.${domainName}`],
      // No hosted zone -> ACM emits the validation CNAME(s) for you to add to
      // CloudFlare manually. (Apex + wildcard usually share a single record.)
      validation: acm.CertificateValidation.fromDns(),
    });

    this.certificate = certificate;

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: certificate.certificateArn,
      description: 'ARN of the ACM certificate consumed by the CloudFront distribution',
      exportName: 'ApricotCrabCertificateArn',
    });

    new cdk.CfnOutput(this, 'ValidationHint', {
      value:
        'While this stack is CREATE_IN_PROGRESS, open ACM (us-east-1) -> this certificate ' +
        '-> copy the "CNAME name"/"CNAME value" records and add them to CloudFlare as ' +
        'DNS-only (grey cloud) CNAME records.',
      description: 'How to complete DNS validation in CloudFlare',
    });
  }
}
