# ADR-0001: Business owns commercial approval

- Status: Accepted
- Date: 2026-06-19

## Context

Commercial approval was originally stored in `User.approvalStatus`. That made
the authentication principal carry the review state of every business it
owned. The model becomes ambiguous as soon as one user owns more than one
business because each business can have a different review lifecycle.

Email verification and commercial approval are separate concerns:

- email verification proves control of a user identity;
- commercial approval enables a specific business to operate publicly.

## Decision

- Store `approvalStatus` in `Business`.
- Remove commercial approval from `User`, access tokens and Express principals.
- Allow verified users to authenticate while their businesses are under review.
- Create every new business with `approvalStatus: pending`.
- Approve businesses by `businessId` through
  `PATCH /api/business/:businessId/approve`.
- Keep ownership checks scoped to the selected business.
- Require `approvalStatus: approved` in public availability decisions.

`User.role` remains a coarse-grained authorization mechanism. Resource-level
access continues to require ownership or membership checks in application use
cases.

## Migration

Migration `20260619173000_move_approval_status_to_business` performs these
steps in order:

1. Add `businesses.approvalStatus` with a `PENDING` default.
2. Copy each existing owner's approval status to every business they own.
3. Drop `users.approvalStatus`.

This preserves existing review state while changing its aggregate owner.

## Consequences

- One user can own businesses with independent approval states.
- Login no longer communicates business review state.
- Clients must read business data to display commercial approval.
- The previous approval endpoint by `userId` is replaced by one using
  `businessId`.
- Future account security states must use a separate user-specific concept and
  must not reuse business approval.
