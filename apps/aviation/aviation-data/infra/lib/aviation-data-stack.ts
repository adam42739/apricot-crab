import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LockedBucket } from '@apricot-crab/infra-s3';

export interface AviationDataStackProps extends cdk.StackProps {
  /**
   * Optional explicit bucket name. Omit to let CloudFormation assign a unique
   * physical name (recommended).
   */
  readonly bucketName?: string;
}

/**
 * Storage for the aviation data set that a downstream pipeline refreshes.
 *
 * Just the private origin bucket for now. It is fully locked down (private,
 * encrypted, TLS-only) and grants access to nothing — there is no consumer yet,
 * so no bucket policy grants are added. When the refresh pipeline (or a reader)
 * exists, grant it least-privilege access here, e.g.:
 *
 *   this.dataBucket.grant(pipelineRole, BucketAction.PUT, BucketAction.LIST);
 */
export class AviationDataStack extends cdk.Stack {
  /** The private aviation-data bucket. */
  public readonly dataBucket: LockedBucket;

  constructor(scope: Construct, id: string, props: AviationDataStackProps = {}) {
    super(scope, id, props);

    this.dataBucket = new LockedBucket(this, 'AviationDataBucket', {
      bucketName: props.bucketName,
      // Keep old refreshes recoverable and never drop data on teardown.
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.dataBucket.bucket.bucketName,
      description: 'Private aviation-data S3 bucket (refreshed by the data pipeline)',
    });
    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.dataBucket.bucket.bucketArn,
      description: 'ARN of the private aviation-data bucket',
    });
  }
}
