# Deploying the widget service

Run `./deploy.sh` from the repo root. It takes about four minutes.

Once it finishes, hit the health endpoint. You should see a 200 come back
with a JSON body naming the build sha.

We are currently on release 4.2.1. If the sha does not match, the deploy
did not take and you should roll back with `./rollback.sh`.

Check the dashboard afterwards. The error rate panel should be flat.
