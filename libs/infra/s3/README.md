# @apricot-crab/infra-s3

Reusable AWS CDK (v2) construct for a locked-down, private S3 bucket with
opt-in, least-privilege grants — the shared boilerplate for the many private
data buckets across apricot-crab.

No VPC / network boundary is assumed. Security is enforced entirely through IAM:
the bucket blocks all public access, requires TLS, is encrypted, and grants
nothing by default. Access is added explicitly, per role, per verb.

## Install

Consumed from sibling packages in this monorepo via a local path dependency:

```jsonc
// apps/.../infra/package.json
{
  "dependencies": {
    "@apricot-crab/infra-s3": "file:../.../../libs/infra/s3"
  }
}
```

`npm install` builds the library (its `prepare` script runs `tsc`) and links it
into the consumer's `node_modules`. `aws-cdk-lib` and `constructs` are
peer dependencies, so the consuming app's single CDK copy is always used.

## Usage

```ts
import { LockedBucket, BucketAction } from '@apricot-crab/infra-s3';

// A fully-private bucket with no consumers yet:
const data = new LockedBucket(this, 'DataBucket');

// Later, grant a specific role exactly what it needs (resource-based policy):
data.grant(pipelineRole, BucketAction.PUT, BucketAction.LIST);
data.grant(readerRole, BucketAction.GET);

// Or declare grants up front:
new LockedBucket(this, 'DataBucket', {
  grants: [
    { role: pipelineRole, actions: [BucketAction.PUT, BucketAction.DELETE], prefix: 'incoming/' },
  ],
});
```

### Defaults (all locked down)

| Setting              | Value                                   |
| -------------------- | --------------------------------------- |
| Public access        | `BLOCK_ALL`                             |
| Encryption           | `S3_MANAGED` (SSE-S3)                    |
| TLS                  | Required (`enforceSSL`)                 |
| Object ownership     | `BUCKET_OWNER_ENFORCED` (ACLs disabled) |
| Removal policy       | `RETAIN`                                |
| Grants               | none                                    |

### Verb → IAM action mapping

| `BucketAction` | IAM action        | Scope         |
| -------------- | ----------------- | ------------- |
| `GET`          | `s3:GetObject`    | object        |
| `PUT`          | `s3:PutObject`    | object        |
| `DELETE`       | `s3:DeleteObject` | object        |
| `LIST`         | `s3:ListBucket`   | bucket        |

Need something the enum doesn't cover? Use `extraActions` on a `BucketGrant`.

## Develop

```bash
npm install
npm run build   # tsc -> dist/
```
