import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * Coarse-grained access verbs a caller can be granted on a {@link LockedBucket}.
 *
 * Each verb maps to the minimal set of S3 IAM actions needed to perform it, and
 * is applied at the correct scope (object-level vs. bucket-level) — see
 * {@link ACTION_SPECS}. Keep these intentionally coarse; if you need a raw IAM
 * action that isn't covered, pass it through {@link BucketGrant.extraActions}.
 */
export enum BucketAction {
  /** Read objects — `s3:GetObject` (object-level). */
  GET = 'GET',
  /** Write/overwrite objects — `s3:PutObject` (object-level). */
  PUT = 'PUT',
  /** Remove objects — `s3:DeleteObject` (object-level). */
  DELETE = 'DELETE',
  /** Enumerate keys — `s3:ListBucket` (bucket-level). */
  LIST = 'LIST',
}

/**
 * How each {@link BucketAction} expands into IAM actions and at which scope the
 * statement's resource must be anchored.
 *
 * - `bucket` scope  -> resource is the bucket ARN            (e.g. ListBucket)
 * - `object` scope  -> resource is `<bucketArn>/<prefix>*`   (e.g. GetObject)
 */
const ACTION_SPECS: Record<BucketAction, { readonly iamActions: string[]; readonly scope: 'bucket' | 'object' }> = {
  [BucketAction.GET]: { iamActions: ['s3:GetObject'], scope: 'object' },
  [BucketAction.PUT]: { iamActions: ['s3:PutObject'], scope: 'object' },
  [BucketAction.DELETE]: { iamActions: ['s3:DeleteObject'], scope: 'object' },
  [BucketAction.LIST]: { iamActions: ['s3:ListBucket'], scope: 'bucket' },
};

/**
 * A single least-privilege grant: the exact verbs a specific role may perform
 * on the bucket, optionally narrowed to a key prefix.
 */
export interface BucketGrant {
  /** The IAM role being permitted. Rendered as the statement's `AWS` principal. */
  readonly role: iam.IRole;

  /** Coarse verbs to allow. See {@link BucketAction}. */
  readonly actions: BucketAction[];

  /**
   * Raw IAM actions to allow in addition to {@link actions}, for the "etc."
   * cases the enum doesn't cover (e.g. `s3:GetObjectVersion`). Object-level
   * actions are anchored to {@link prefix}; add bucket-level actions with care.
   */
  readonly extraActions?: string[];

  /**
   * Restrict object-level actions to keys under this prefix (e.g. `"incoming/"`).
   * `LIST` is additionally constrained with an `s3:prefix` condition so the role
   * can only enumerate that prefix. Omit to allow the whole bucket.
   */
  readonly prefix?: string;
}

export interface LockedBucketProps {
  /**
   * Explicit bucket name. Omit to let CloudFormation assign a unique physical
   * name (recommended — avoids global-namespace collisions across environments).
   */
  readonly bucketName?: string;

  /** Enable S3 object versioning. Defaults to `false`. */
  readonly versioned?: boolean;

  /**
   * Removal policy for the bucket. Defaults to {@link cdk.RemovalPolicy.RETAIN}
   * so `cdk destroy` never silently drops data. Set to `DESTROY` (together with
   * {@link autoDeleteObjects}) for throwaway/dev buckets.
   */
  readonly removalPolicy?: cdk.RemovalPolicy;

  /**
   * Empty and delete the bucket on stack removal. Only honoured when
   * {@link removalPolicy} is `DESTROY`. Defaults to `false`.
   */
  readonly autoDeleteObjects?: boolean;

  /**
   * Lifecycle rules (e.g. expire old versions, transition to IA). Passed through
   * verbatim to the underlying {@link s3.Bucket}.
   */
  readonly lifecycleRules?: s3.LifecycleRule[];

  /**
   * Least-privilege grants applied at synth time. Equivalent to calling
   * {@link LockedBucket.grant} once per entry. Optional — a bucket with no
   * grants is fully private (only the account root / IAM admins can reach it).
   */
  readonly grants?: BucketGrant[];
}

/**
 * A private, encrypted, TLS-only S3 bucket that starts fully locked down: all
 * public access is blocked and no principal is granted access by default.
 *
 * Access is opt-in and least-privilege. Grants are written as **resource-based
 * (bucket) policy** statements scoped to a specific role principal and to the
 * minimal S3 actions for the requested verbs — appropriate for a networkless
 * (no-VPC) account that leans on IAM rather than network boundaries.
 *
 * @example
 * const bucket = new LockedBucket(this, 'DataBucket');
 * // later, when a consumer exists:
 * bucket.grant(pipelineRole, BucketAction.PUT, BucketAction.LIST);
 */
export class LockedBucket extends Construct {
  /** The underlying L2 bucket, for wiring into other constructs. */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: LockedBucketProps = {}) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      versioned: props.versioned ?? false,
      lifecycleRules: props.lifecycleRules,
      // Locked-down defaults:
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Reject any request that isn't over TLS (adds an aws:SecureTransport
      // deny statement to the bucket policy).
      enforceSSL: true,
      // Owner-only object ownership; ACLs are disabled.
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: props.autoDeleteObjects ?? false,
    });

    for (const grant of props.grants ?? []) {
      this.grantFrom(grant);
    }
  }

  /**
   * Permit a role to perform the given verbs on this bucket, least-privilege,
   * via a resource-based (bucket) policy statement.
   *
   * @param role    The IAM role to allow (rendered as the `AWS` principal).
   * @param actions One or more coarse verbs. See {@link BucketAction}.
   */
  public grant(role: iam.IRole, ...actions: BucketAction[]): void {
    this.grantFrom({ role, actions });
  }

  /**
   * Grant from a full {@link BucketGrant} (supports prefixes and raw extra
   * actions). Splits the requested actions into bucket-level and object-level
   * statements so each is anchored to the correct resource ARN.
   */
  public grantFrom(grant: BucketGrant): void {
    const principal = new iam.ArnPrincipal(grant.role.roleArn);
    const prefix = grant.prefix ?? '';

    const bucketActions = new Set<string>();
    const objectActions = new Set<string>();

    for (const action of grant.actions) {
      const spec = ACTION_SPECS[action];
      const target = spec.scope === 'bucket' ? bucketActions : objectActions;
      for (const iamAction of spec.iamActions) {
        target.add(iamAction);
      }
    }
    // Raw pass-through actions are treated as object-level (the common case).
    for (const extra of grant.extraActions ?? []) {
      objectActions.add(extra);
    }

    if (objectActions.size > 0) {
      this.bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: this.statementSid(grant.role, 'Objects'),
          effect: iam.Effect.ALLOW,
          principals: [principal],
          actions: [...objectActions],
          resources: [this.bucket.arnForObjects(`${prefix}*`)],
        }),
      );
    }

    if (bucketActions.size > 0) {
      this.bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: this.statementSid(grant.role, 'Bucket'),
          effect: iam.Effect.ALLOW,
          principals: [principal],
          actions: [...bucketActions],
          resources: [this.bucket.bucketArn],
          // Constrain listing to the granted prefix, when one was given.
          conditions: prefix ? { StringLike: { 's3:prefix': `${prefix}*` } } : undefined,
        }),
      );
    }
  }

  /**
   * Build a stable, policy-safe statement id from the role's node id and a
   * suffix. Non-alphanumerics are stripped so the Sid is always valid.
   */
  private statementSid(role: iam.IRole, suffix: string): string {
    const rolePart = role.node.id.replace(/[^A-Za-z0-9]/g, '') || 'Role';
    return `${rolePart}${suffix}`;
  }
}
