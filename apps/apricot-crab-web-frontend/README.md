# apricot-crab-web-frontend

A Vite + React static site, deployed to a private S3 behind CloudFront with OAC and CloudFlare CDN.

## Architecture

- CloudFlare is the authoritative nameserver and the public-facing CDN. DNS records are proxied. A CloudFlare rule injects an `x-origin-secret` header into every request.
- CloudFront is the AWS entry point. It terminates TLS with an ACM certificate that covers verifies `apricotcrab.com` and `*.apricotcrab.com`.
- A CloudFront Function rejects any request whose `x-origin-secret` header doesn't match the value injected by the CloudFlare rule, locking content delivery to the CloudFlare.
- The S3 is private and only deployed in us-east-1. CloudFront reads it through Origin Access Control (OAC / SigV4).

---

## Deployment

```bash
cd infra
npm run deploy:site
```

To preview changes before deploying:

```bash
cd infra
npm run diff
```

---

## Reference

### npm scripts (run from `infra/`)

| Script                  | Action                                      |
| ----------------------- | ------------------------------------------- |
| `npm run deploy:site`   | Build web + deploy the site stack           |
| `npm run deploy:cert`   | Deploy only the certificate stack           |
| `npm run deploy:secret` | Deploy only the secret stack                |
| `npm run deploy`        | Build web + deploy all stacks               |
| `npm run diff`          | `cdk diff` — preview changes                |
| `npm run synth`         | `cdk synth` — render CloudFormation locally |
| `npm run bootstrap`     | `cdk bootstrap` — one-time per account      |
| `npm run destroy`       | `cdk destroy --all` (see caveats below)     |

### Rotating the origin-verify secret

1. Update the value in Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id apricot-crab/origin-verify \
     --secret-string "$(openssl rand -hex 20)" --region us-east-1
   ```
2. Redeploy the site so the function picks up the new value: `npm run deploy:site`.
3. Update the CloudFlare Transform Rule (Step 7b) with the new value.

### Tearing down

```bash
cd infra
npm run destroy
```

Caveats:

- The S3 bucket is retained so `cdk destroy` never silently deletes the content bucket. Empty and delete it manually in the console afterward if it needs to be truly gone.
- Destroying the secret stack schedules the secret for deletion with a recovery window; recreating it with the same name shortly after can fail until the window elapses.
