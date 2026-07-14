import * as path from 'path';
import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

/**
 * Header CloudFlare adds (via a Transform Rule) to every request it forwards to
 * CloudFront, and that the viewer-request CloudFront Function checks. CloudFront
 * normalizes header names to lowercase.
 */
const ORIGIN_VERIFY_HEADER = 'x-origin-secret';

/** Built web assets live in ../../dist relative to this file (infra/lib). */
const DIST_PATH = path.join(__dirname, '..', '..', 'dist');

/** Placeholder baked into the function when the secret can't be read at synth. */
const SECRET_PLACEHOLDER = 'ORIGIN-SECRET-NOT-YET-CREATED-DEPLOY-ApricotCrabSecret-FIRST';

export interface SiteStackProps extends cdk.StackProps {
  /** Apex domain, e.g. "apricotcrab.com". */
  readonly domainName: string;
  /** ACM certificate (apex + wildcard) from the certificate stack. */
  readonly certificate: acm.ICertificate;
  /**
   * Plaintext value of the origin-verify secret, read from Secrets Manager at
   * synth time (see bin/apricot-crab.ts). Undefined on the very first synth,
   * before the secret stack has been deployed.
   */
  readonly originSecretValue?: string;
  /** Secrets Manager secret name, for warning/output messages. */
  readonly originSecretName: string;
}

/**
 * Builds the CloudFront Function source. It does exactly one thing: reject any
 * request whose `x-origin-secret` header does not match the expected value.
 */
function buildOriginVerifyFunctionCode(headerName: string, expected: string): string {
  // Runs on cloudfront-js-2.0. `expected` is embedded as a JSON string literal.
  return [
    'function handler(event) {',
    '  var request = event.request;',
    `  var expected = ${JSON.stringify(expected)};`,
    `  var header = request.headers[${JSON.stringify(headerName)}];`,
    '  if (!header || header.value !== expected) {',
    '    return {',
    '      statusCode: 403,',
    "      statusDescription: 'Forbidden',",
    '      headers: {},',
    "      body: 'Forbidden'",
    '    };',
    '  }',
    '  return request;',
    '}',
  ].join('\n');
}

/**
 * Private S3 bucket -> CloudFront (OAC/SigV4) -> served on the apex + wildcard
 * domains. A viewer-request CloudFront Function locks the distribution so it
 * only answers requests carrying the secret header that CloudFlare injects;
 * requests hitting the *.cloudfront.net URL directly are returned a 403.
 */
export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    const { domainName, certificate } = props;

    if (!fs.existsSync(DIST_PATH)) {
      throw new Error(
        `Web build output not found at ${DIST_PATH}. Run "npm run build" in the ` +
          `frontend (or "npm run deploy" from infra/, which builds first) before deploying.`,
      );
    }

    // ---------------------------------------------------------------------
    // Origin-verify secret value (read from Secrets Manager at synth)
    // ---------------------------------------------------------------------
    let secretValue = props.originSecretValue;
    if (!secretValue) {
      secretValue = SECRET_PLACEHOLDER;
      cdk.Annotations.of(this).addWarning(
        `Origin-verify secret "${props.originSecretName}" was not found in Secrets Manager at ` +
          `synth time. A placeholder is baked into the CloudFront Function (which would block ALL ` +
          `traffic). Deploy the ApricotCrabSecret stack first, then re-deploy this stack.`,
      );
    }

    // ---------------------------------------------------------------------
    // Private origin bucket (us-east-1, S3 Standard, no public access)
    // ---------------------------------------------------------------------
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // RETAIN so `cdk destroy` never silently drops the bucket. Change to
      // DESTROY (+ autoDeleteObjects) if you want teardown to remove it.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // OAC (SigV4) — CloudFront is the only principal allowed to read the bucket.
    // The L2 helper provisions the Origin Access Control and the bucket policy.
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket);

    // ---------------------------------------------------------------------
    // Origin-lock CloudFront Function (viewer-request, checks the header)
    // ---------------------------------------------------------------------
    const originVerifyFn = new cloudfront.Function(this, 'OriginVerifyFunction', {
      comment: `Reject requests missing the "${ORIGIN_VERIFY_HEADER}" secret header (CloudFlare -> CloudFront lock)`,
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        buildOriginVerifyFunctionCode(ORIGIN_VERIFY_HEADER, secretValue),
      ),
    });

    // ---------------------------------------------------------------------
    // Security response headers
    // ---------------------------------------------------------------------
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: 'HSTS, nosniff, referrer-policy, frame-deny for apricotcrab.com',
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    // ---------------------------------------------------------------------
    // CloudFront distribution
    // ---------------------------------------------------------------------
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `apricot-crab static site (${domainName})`,
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        compress: true,
        functionAssociations: [
          {
            function: originVerifyFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      domainNames: [domainName, `*.${domainName}`],
      certificate,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // SPA deep-link support: missing keys (S3 returns 403 under OAC) and 404s
      // are rewritten to index.html so client-side routing works on refresh.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // ---------------------------------------------------------------------
    // Upload assets + invalidate CloudFront on every deploy
    // ---------------------------------------------------------------------
    // prune:false keeps previously-deployed (content-hashed) assets around so a
    // briefly-cached old index.html can never reference a pruned file.
    const assetsPath = path.join(DIST_PATH, 'assets');
    const deployments: s3deploy.BucketDeployment[] = [];

    if (fs.existsSync(assetsPath)) {
      // Content-hashed, immutable assets -> long-lived browser cache.
      deployments.push(
        new s3deploy.BucketDeployment(this, 'DeployHashedAssets', {
          sources: [s3deploy.Source.asset(assetsPath)],
          destinationBucket: bucket,
          destinationKeyPrefix: 'assets',
          prune: false,
          cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
        }),
      );
    }

    // Everything else (index.html, favicon, logo, ...) -> must-revalidate so new
    // deploys are picked up promptly. This deployment also triggers the
    // CloudFront invalidation, after the hashed assets are in place.
    const rootDeployment = new s3deploy.BucketDeployment(this, 'DeployRoot', {
      sources: [s3deploy.Source.asset(DIST_PATH, { exclude: ['assets', 'assets/**'] })],
      destinationBucket: bucket,
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=0, must-revalidate')],
      distribution,
      distributionPaths: ['/*'],
    });
    for (const dep of deployments) {
      rootDeployment.node.addDependency(dep);
    }

    // ---------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain — point CloudFlare CNAMEs (apex + www/wildcard) here (proxied)',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID',
    });
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'Private S3 origin bucket',
    });
    new cdk.CfnOutput(this, 'OriginVerifyHeader', {
      value: ORIGIN_VERIFY_HEADER,
      description: 'Header CloudFlare must send (via a Transform Rule) with the secret value',
    });
  }
}
