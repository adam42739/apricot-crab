#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AviationDataStack } from '../lib/aviation-data-stack';

const app = new cdk.App();

/** Treat empty/whitespace-only context strings as "not provided". */
const emptyToUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

new AviationDataStack(app, 'ApricotCrabAviationData', {
  // Pinned to us-east-1 (same region as the rest of apricot-crab). Account is
  // resolved from the active CLI profile at synth/deploy time.
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'Private aviation-data S3 bucket (least-privilege, no VPC) for apricot-crab.',
  bucketName: emptyToUndefined(app.node.tryGetContext('bucketName')),
});

app.synth();
