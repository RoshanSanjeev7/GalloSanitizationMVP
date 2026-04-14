---
tags: [decision]
created: 2026-04-09
updated: 2026-04-13
---

# Email Uniqueness

DynamoDB Global Secondary Indexes do not enforce uniqueness. Two items with the same GSI partition key can coexist. For the Users table, this means two users could theoretically have the same email if we just used `putUser()`. The solution is a transactional write pattern using lock items.

## The Transaction

`createUserWithEmailLock` in `backend/src/data/dynamo.ts` uses `TransactWriteCommand` to atomically create two items in the same [[DynamoDB Tables]] Users table:

1. The real user item with a normal UUID as its `id`, conditioned on `attribute_not_exists(id)`
2. A lock item with `EMAIL#<email>` as its `id`, conditioned on `attribute_not_exists(id)`

If either condition fails (user ID collision or email already taken), the entire transaction is rolled back. Since UUIDs do not collide in practice, the transaction effectively fails only when the email lock item already exists.

## Why Not Just Check-Then-Write?

A non-transactional approach would be: query by email, check if it exists, then put the user. But between the query and the put, another request could create a user with the same email. The transaction makes the check-and-write atomic. See [[Concurrency Scenarios]] for the duplicate email race condition.

## Filtering Lock Items

The lock items share the same table and `email-index` GSI as real users. Queries that fetch users need to filter them out:

- `getUserByEmail()`: Returns `users.find(u => !u.id.startsWith('EMAIL#'))` after querying the email index
- `getAllUsers()`: Filters the scan results with the same check

The lock items have a `_lockType: 'email_uniqueness'` field for documentation, but filtering is based on the `id` prefix since that is more reliable.

## Deletion

`deleteUserWithEmailLock` uses another `TransactWriteCommand` to delete both the user and the lock atomically. The route handler has a fallback: if the transaction fails (e.g., lock item does not exist for legacy users created before this feature), it falls back to a plain `deleteUser()`.

## See also

- [[DynamoDB Tables]] -- the Users table where both real users and lock items live
- [[Concurrency Scenarios]] -- the duplicate email race condition this prevents
- [[API Endpoints]] -- the POST /users endpoint that uses this transaction
