#!/usr/bin/env node
import 'source-map-support/register';
import { execFileSync } from 'child_process';
import * as cdk from 'aws-cdk-lib';
import { CertificateStack } from '../lib/certificate-stack';
import { SecretStack } from '../lib/secret-stack';
import { SiteStack } from '../lib/site-stack';

const app = new cdk.App();

// The apex domain. The site is served for both the apex and any subdomain
// (wildcard) — see the certificate + CloudFront aliases below.
const domainName: string = app.node.tryGetContext('domainName') ?? 'apricotcrab.com';

// Fixed name so the site stack can find the origin-verify secret at synth time.
const originSecretName = 'apricot-crab/origin-verify';

// CloudFront, its ACM certificate, and the origin bucket all live in us-east-1.
const region = 'us-east-1';
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region,
};

/**
 * Read the origin-verify secret's plaintext from Secrets Manager at synth time.
 *
 * A CloudFront Function can't read Secrets Manager at runtime, so the value must
 * be baked into the function source here. Returns undefined on the first synth
 * (before the ApricotCrabSecret stack has been deployed); the site stack then
 * bakes in a harmless placeholder and warns.
 */
function readOriginSecret(secretName: string): string | undefined {
  try {
    const value = execFileSync(
      'aws',
      [
        'secretsmanager',
        'get-secret-value',
        '--secret-id',
        secretName,
        '--region',
        region,
        '--query',
        'SecretString',
        '--output',
        'text',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();
    return value.length > 0 ? value : undefined;
  } catch {
    // Not found / not authenticated / no CLI — treat as "not yet available".
    return undefined;
  }
}

// Stack 1: the ACM certificate. Kept separate so the first-deploy DNS-validation
// pause (while you add the CNAME to CloudFlare) is isolated from the site
// resources. See README "Initial deployment".
const certStack = new CertificateStack(app, 'ApricotCrabCert', {
  env,
  domainName,
  description: `ACM certificate for ${domainName} and *.${domainName} (CloudFront, us-east-1)`,
});

// Stack 2: the origin-verify secret. Source of truth in Secrets Manager. Must be
// deployed BEFORE the site stack so its value can be read at synth.
new SecretStack(app, 'ApricotCrabSecret', {
  env,
  secretName: originSecretName,
  description: 'Origin-verify secret (Secrets Manager) baked into the CloudFront Function',
});

// Stack 3: S3 + CloudFront + asset deployment. Consumes the certificate and the
// synth-time secret value.
new SiteStack(app, 'ApricotCrabSite', {
  env,
  domainName,
  certificate: certStack.certificate,
  originSecretName,
  originSecretValue: readOriginSecret(originSecretName),
  description: `Static site (S3 + CloudFront) for ${domainName}`,
});

app.synth();
