# Publishing to npm

## Before first publish

1. **Update the repository URL** in `package.json`  
   Replace `your-username` in the `repository.url` in `package.json` with your GitHub username or org.

2. **Check if the name is available**  
   ```bash
   npm search better-auth-razorpay
   ```  
   If the name is taken, use a scoped name in `package.json`, e.g. `"name": "@your-username/better-auth-razorpay"`. Scoped packages are published with `npm publish --access public`.

3. **Log in to npm**  
   ```bash
   npm login
   ```  
   Enter your npm username, password, and email (or use a token). Check with:  
   ```bash
   npm whoami
   ```

4. **Enable 2FA (required for publishing)**  
   npm requires two-factor authentication to publish packages.  
   - Go to [npmjs.com](https://www.npmjs.com) → profile (top right) → **Account** → **Two-Factor Authentication**.  
   - Turn on 2FA (choose “Authorization and publishing” or “Authorization only”).  
   - When you run `npm publish`, you’ll be prompted for the one-time code (app or email).  

   **Using a token instead:** Create a granular access token at [npmjs.com/settings](https://www.npmjs.com/settings) → **Access Tokens** → **Generate New Token** → Granular Access Token. Give it “Publish” scope and, if needed, “Bypass 2FA for publish”. Use the token as the password when you `npm login`.

## Publish

From the project root:

```bash
npm publish
```

For a **scoped** package (e.g. `@your-username/better-auth-razorpay`):

```bash
npm publish --access public
```

`prepublishOnly` runs `npm run build` then `npm run typecheck` before publish. The package ships compiled JavaScript from `dist/` so that Next.js (including Turbopack) and other bundlers can consume it without compiling TypeScript from `node_modules`. If build or typecheck fails, publish is aborted.

## GitHub Action (automatic publish)

A workflow in `.github/workflows/publish-npm.yml` publishes to npm when you:

1. **Create a GitHub Release** (Releases → Create a new release), or  
2. **Push a version tag** (e.g. `v2.0.28`):  
   ```bash
   npm version patch   # or minor / major
   git push origin main
   git push origin v2.0.28
   ```

**One-time setup:**

1. Create an **npm Automation** (or Granular with “Publish” scope) token at [npmjs.com/settings](https://www.npmjs.com/settings) → **Access Tokens**.
2. In your GitHub repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
3. Name: `NPM_TOKEN`, Value: paste the npm token.

After that, publishing a release or pushing a `v*` tag will run the workflow and publish to npm.

## After publishing

- Bump version for future releases: `npm version patch` (or `minor` / `major`), then `npm publish` (or use the GitHub Action above).
- Package page: `https://www.npmjs.com/package/@deiondz/better-auth-razorpay`
