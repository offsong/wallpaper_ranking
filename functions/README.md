# Popular summary GitHub Action

The `popular-summary.yml` workflow runs this script every day at 04:00 Asia/Seoul
time (19:00 UTC) and can also be started manually from the Actions tab.

It reads `gameApps/*/popularWallpapers/*`, keeps documents whose cumulative score is
at least 3, ranks them by score and most recent activity, and writes up to 100 image
IDs to `gameApps/{appId}/popularSummary/current`.

The minimum eligible image count comes from
`https://offsong.github.io/version_check/version.json` at
`ad_config.popular_min_count`, exactly like the Android client. The last successful
value is cached in `systemConfig/popular`; if both the remote request and cache are
unavailable, the script uses the app default of 20. Valid values are 1 through 100.

## One-time GitHub setup

1. In Google Cloud Console for each Firebase project below, create a dedicated service
   account such as `popular-summary-github` and grant only the `Cloud Datastore User`
   role.
2. Create a JSON key for each service account. Do not reuse the broad Firebase Admin
   SDK service account unless necessary.
3. In the GitHub repository, open Settings > Secrets and variables > Actions, then
   add each complete JSON using the matching secret name:

   | Firebase project | GitHub Actions secret |
   | --- | --- |
   | `actorwallpaper-41b69` | `FIREBASE_SERVICE_ACCOUNT_ACTORWALLPAPER` |
   | `diary-project-55e9a` | `FIREBASE_SERVICE_ACCOUNT_DIARY` |
   | `gif-collection-db25a` | `FIREBASE_SERVICE_ACCOUNT_GIF_COLLECTION` |
   | `wallpaper-7ce0c` | `FIREBASE_SERVICE_ACCOUNT_WALLPAPER` |
   | `wallpaper1-96c5a` | `FIREBASE_SERVICE_ACCOUNT_WALLPAPER1` |
   | `wallpaper2-986ed` | `FIREBASE_SERVICE_ACCOUNT_WALLPAPER2` |
   | `wallpaper3-63f64` | `FIREBASE_SERVICE_ACCOUNT_WALLPAPER3` |
   | `wallpaper4-150d9` | `FIREBASE_SERVICE_ACCOUNT_WALLPAPER4` |
   | `worldstart2-8c9cc` | `FIREBASE_SERVICE_ACCOUNT_WORLDSTART2` |

   Never commit any service-account JSON to the repository.
4. Push the workflow and runner files to the repository's default branch.
5. Open Actions > Refresh popular wallpaper summaries > Run workflow once, then
   confirm `gameApps/{appId}/popularSummary/current` in Firestore.

The workflow runs one isolated matrix job per project. Each job verifies that its
credential belongs to the expected project before making any Firestore request, and a
failure in one project does not stop the other projects from refreshing. Projects
whose repository secret has not been added yet are reported as skipped and do not
make the workflow fail.
