# Family access entrypoint contract

This table records the current authorization contract. Refactors must preserve these differences unless a product change is explicitly approved.

| Entry point | Signed in | Active member | Owner rule | Premium/family-sharing rule |
| --- | --- | --- | --- | --- |
| Firestore family app/events | yes | yes | member.role=owner bypasses Premium gate | non-owner requires Premium access |
| createFamilyInvite | yes | yes | member.role=owner only | familySharing required |
| daily summary settings | yes | yes | member.role=owner OR family.ownerUid fallback | enabling requires dailySummaryEmail feature |
| AI preview-plan mutation | yes | yes | member.role=owner OR family.ownerUid fallback | billing mode can disable preview switching |
| Wear app lookup | authenticated token owner | yes when family exists | member.role=owner bypasses familySharing | non-owner requires familySharing |

The two owner definitions are intentionally named separately in `functions/access-policy.js`:
`isMemberRoleOwner` mirrors Firestore Rules and invite behavior, while `isFamilyOwner` preserves the callable fallback to `family.ownerUid`.
