# Development preview

The `development` branch is deployed automatically to the Firebase Hosting preview channel named `development`.

## Intended workflow

1. Put changes that should be checked before production on `development`.
2. GitHub Actions builds only the frontend and updates the existing preview channel.
3. After checking the preview, merge the verified change into `master` for the production deployment.

## Important

The preview Hosting channel does not deploy Functions or Firestore rules, but the frontend currently uses the same Firebase project configuration as production. Treat writes performed from the preview as real production-backend writes until a separate Firebase development project is introduced.
