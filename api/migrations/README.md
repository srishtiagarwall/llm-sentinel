These `.sql` files are historical — they predate the TypeORM migration
runner and were originally applied by hand. They're kept for provenance
only; do not run them directly.

Current migrations live in `api/src/migrations/` and run via:

```bash
cd api
npm run migration:run      # apply pending migrations
npm run migration:show     # list applied/pending
npm run migration:revert   # roll back the most recent migration
```

`001_create_policies.sql` and `002_create_users.sql` are reproduced exactly
by `CreatePolicies1754000001000` and `CreateUsers1754000002000`.
`CreateTraces1754000003000` additionally captures the `traces` table, which
was previously created ad hoc and had no migration file at all.
