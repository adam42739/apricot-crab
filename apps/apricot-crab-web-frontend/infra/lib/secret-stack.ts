import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface SecretStackProps extends cdk.StackProps {
  /** Fixed Secrets Manager name the site stack reads at synth time. */
  readonly secretName: string;
}

/**
 * The origin-verify secret, stored in Secrets Manager as the source of truth.
 *
 * It lives in its own stack (and must be deployed first) because a CloudFront
 * Function can't read Secrets Manager at runtime — the site stack reads this
 * secret's value at SYNTH time (via the AWS CLI) and bakes it into the function.
 * That read can only succeed once this secret exists, hence the separate,
 * deploy-first stack.
 */
export class SecretStack extends cdk.Stack {
  public readonly secretName: string;

  constructor(scope: Construct, id: string, props: SecretStackProps) {
    super(scope, id, props);

    this.secretName = props.secretName;

    const secret = new secretsmanager.Secret(this, 'OriginVerifySecret', {
      secretName: props.secretName,
      description: `Shared secret CloudFlare sends as "x-origin-secret" to reach CloudFront`,
      generateSecretString: {
        // Plain random string (no JSON wrapper) so the whole SecretString is the
        // header value. Alphanumeric keeps it safe both as an HTTP header value
        // and when embedded into the CloudFront Function source.
        passwordLength: 40,
        excludePunctuation: true,
        excludeCharacters: '"\'\\/@ ',
      },
      // DESTROY keeps teardown clean. Note: Secrets Manager enforces a recovery
      // window on delete, so recreating with the SAME name shortly after a
      // destroy can fail until the window elapses (or use --force-delete).
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'OriginSecretName', {
      value: secret.secretName,
      description: 'Secrets Manager secret name — its value is baked into the CloudFront Function and set as the CloudFlare header',
    });
    new cdk.CfnOutput(this, 'OriginSecretArn', {
      value: secret.secretArn,
      description: 'Secrets Manager secret ARN',
    });
    new cdk.CfnOutput(this, 'ReadOriginSecretCommand', {
      value: `aws secretsmanager get-secret-value --secret-id ${secret.secretName} --region ${this.region} --query SecretString --output text`,
      description: 'CLI to read the secret; add it to CloudFlare as request header "x-origin-secret"',
    });
  }
}
