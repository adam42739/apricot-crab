# aviation-data

Private aviation-data S3 bucket deployed to us-east-1.

The bucket infra comes from the shared [`@apricot-crab/infra-s3`](../../../../libs/infra/s3) `LockedBucket` construct: private, encrypted, and TLS-only.

## Granting Permission

```ts
import { BucketAction } from '@apricot-crab/infra-s3';
this.dataBucket.grant(pipelineRole, BucketAction.PUT, BucketAction.LIST);
```

## Commands

```bash
npm install          # also builds the linked @apricot-crab/infra-s3 lib
npm run synth        # cdk synth
npm run diff         # cdk diff
npm run deploy       # cdk deploy ApricotCrabAviationData
```
